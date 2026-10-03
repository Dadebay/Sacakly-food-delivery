//go:build darwin

package main

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

type systemNetworkDriver struct{}

func newSystemNetworkDriver() networkDriver { return systemNetworkDriver{} }
func networkStatePath() string {
	return "/Library/Application Support/A7-tagam Print Agent/network-state.json"
}

func prepareNetworkStateDir() error {
	if os.Geteuid() != 0 {
		return errors.New("настройка сети требует подтверждения администратора macOS")
	}
	dir := filepath.Dir(networkStatePath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || !info.IsDir() || stat.Uid != 0 || info.Mode().Perm()&0022 != 0 {
		return errors.New("каталог сохранённых настроек должен принадлежать root и быть защищён от записи")
	}
	return nil
}

func replaceNetworkState(from, to string) error { return os.Rename(from, to) }

func lockNetworkState(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, errors.New("другая настройка сети уже выполняется")
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); _ = f.Close() }, nil
}

var serviceDevicePattern = regexp.MustCompile(`Hardware Port: (.*), Device: ([^)]+)\)`)
var serviceNamePattern = regexp.MustCompile(`^\([0-9]+\) (.*)$`)

func (systemNetworkDriver) adapters(ctx context.Context) ([]networkAdapter, error) {
	out, err := exec.CommandContext(ctx, "/usr/sbin/networksetup", "-listnetworkserviceorder").Output()
	if err != nil {
		return nil, err
	}
	var adapters []networkAdapter
	service := ""
	for _, line := range strings.Split(string(out), "\n") {
		if match := serviceNamePattern.FindStringSubmatch(line); match != nil {
			service = match[1]
			continue
		}
		match := serviceDevicePattern.FindStringSubmatch(line)
		if match == nil || service == "" {
			continue
		}
		iface, err := net.InterfaceByName(strings.TrimSpace(match[2]))
		if err != nil || len(iface.HardwareAddr) != 6 {
			continue
		}
		info, err := exec.CommandContext(ctx, "/usr/sbin/networksetup", "-getinfo", service).Output()
		if err != nil {
			continue
		}
		link, err := exec.CommandContext(ctx, "/sbin/ifconfig", iface.Name).Output()
		if err != nil {
			continue
		}
		hardware := strings.ToLower(match[1])
		a := networkAdapter{Name: iface.Name, Index: iface.Index, MAC: iface.HardwareAddr.String(), DHCP: !strings.HasPrefix(string(info), "Manual Configuration"), Up: strings.Contains(string(link), "status: active")}
		a.Wired = (strings.Contains(hardware, "ethernet") || strings.Contains(hardware, "lan")) && !strings.Contains(hardware, "iphone") && !strings.Contains(hardware, "bridge") && !strings.Contains(hardware, "wi-fi")
		for _, row := range strings.Split(string(info), "\n") {
			if strings.HasPrefix(row, "Router: ") {
				gateway := strings.TrimSpace(strings.TrimPrefix(row, "Router: "))
				if gateway != "(null)" && gateway != "none" {
					a.Gateway = gateway
				}
			}
		}
		addresses, err := iface.Addrs()
		if err != nil {
			return nil, err
		}
		for _, addr := range addresses {
			if p, err := netip.ParsePrefix(addr.String()); err == nil && p.Addr().Is4() {
				a.Addresses = append(a.Addresses, p.String())
			}
		}
		adapters = append(adapters, a)
	}
	return adapters, nil
}

func (systemNetworkDriver) add(ctx context.Context, a networkAdapter, cidr string) error {
	p, err := netip.ParsePrefix(cidr)
	if err != nil {
		return err
	}
	mask := net.IP(net.CIDRMask(p.Bits(), 32)).String()
	out, err := exec.CommandContext(ctx, "/sbin/ifconfig", a.Name, "inet", p.Addr().String(), "netmask", mask, "alias").CombinedOutput()
	if err != nil {
		return fmt.Errorf("добавление IP: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func (systemNetworkDriver) remove(ctx context.Context, a networkAdapter, cidr string) error {
	p, err := netip.ParsePrefix(cidr)
	if err != nil {
		return err
	}
	out, err := exec.CommandContext(ctx, "/sbin/ifconfig", a.Name, "inet", p.Addr().String(), "-alias").CombinedOutput()
	if err != nil {
		return fmt.Errorf("удаление дополнительного IP: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// ARP probes use sender IP 0.0.0.0 (RFC 5227) and never assign an address.
// BPF is opened only in the elevated, short-lived worker; no packet payloads
// are logged, and all unrelated frames are ignored.
func (systemNetworkDriver) neighbor(ctx context.Context, a networkAdapter, ip netip.Addr) (bool, error) {
	var file *os.File
	var err error
	for i := 0; i < 256; i++ {
		file, err = os.OpenFile("/dev/bpf"+strconv.Itoa(i), os.O_RDWR, 0)
		if err == nil {
			break
		}
		if !errors.Is(err, syscall.EBUSY) {
			return false, err
		}
	}
	if file == nil {
		return false, errors.New("нет свободного BPF для ARP-проверки")
	}
	defer file.Close()
	fd := file.Fd()
	ioctl := func(request uintptr, value unsafe.Pointer) error {
		_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, request, uintptr(value))
		if errno != 0 {
			return errno
		}
		return nil
	}
	var ifreq [32]byte
	if len(a.Name) >= 16 {
		return false, errors.New("неверное имя интерфейса")
	}
	copy(ifreq[:16], a.Name)
	if err = ioctl(syscall.BIOCSETIF, unsafe.Pointer(&ifreq[0])); err != nil {
		return false, err
	}
	var linkType uint32
	if err = ioctl(syscall.BIOCGDLT, unsafe.Pointer(&linkType)); err != nil {
		return false, err
	}
	if linkType != 1 {
		return false, errors.New("ARP-проверка поддерживает только Ethernet")
	}
	one := uint32(1)
	if err = ioctl(syscall.BIOCIMMEDIATE, unsafe.Pointer(&one)); err != nil {
		return false, err
	}
	var size uint32
	if err = ioctl(syscall.BIOCGBLEN, unsafe.Pointer(&size)); err != nil {
		return false, err
	}
	if size == 0 || size > 1<<20 {
		return false, errors.New("неверный размер буфера BPF")
	}
	if err = syscall.SetNonblock(int(fd), true); err != nil {
		return false, err
	}
	mac, err := net.ParseMAC(a.MAC)
	if err != nil {
		return false, err
	}
	frame := makeARPProbe(mac, ip)
	buf := make([]byte, int(size))
	for attempt := 0; attempt < 3; attempt++ {
		if _, err = syscall.Write(int(fd), frame); err != nil {
			return false, err
		}
		deadline := time.Now().Add(500 * time.Millisecond)
		for time.Now().Before(deadline) {
			if err = ctx.Err(); err != nil {
				return false, err
			}
			n, readErr := syscall.Read(int(fd), buf)
			if errors.Is(readErr, syscall.EAGAIN) {
				time.Sleep(20 * time.Millisecond)
				continue
			}
			if readErr != nil {
				return false, readErr
			}
			for offset := 0; offset+18 <= n; {
				// Darwin's bpf_hdr contains timeval32, caplen, datalen, hdrlen.
				caplen := int(binary.NativeEndian.Uint32(buf[offset+8:]))
				hdrlen := int(binary.NativeEndian.Uint16(buf[offset+16:]))
				if hdrlen < 18 || caplen < 0 || offset+hdrlen+caplen > n {
					break
				}
				if arpClaimsAddress(buf[offset+hdrlen:offset+hdrlen+caplen], mac, ip) {
					return true, nil
				}
				offset += (hdrlen + caplen + 3) &^ 3
			}
		}
	}
	return false, nil
}

func elevateNetworkWorker(encoded string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if os.Geteuid() == 0 {
		return runNetworkWorker(encoded)
	}
	command := shellQuote(exe) + " -network-worker " + shellQuote(encoded)
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	script := "do shell script " + strconv.Quote(command) + " with administrator privileges with prompt " + strconv.Quote("A7-tagam: настройка дополнительного адреса кабеля для чековых аппаратов. Исходные IP и Wi-Fi сохраняются.")
	out, err := exec.CommandContext(ctx, "/usr/bin/osascript", "-e", script).CombinedOutput()
	if err != nil {
		return fmt.Errorf("системное подтверждение/настройка: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'" }

func openNetworkSettings(url string) { _ = exec.Command("/usr/bin/open", url).Run() }
