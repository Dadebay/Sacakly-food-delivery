//go:build windows

package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

type systemNetworkDriver struct{}

func newSystemNetworkDriver() networkDriver { return systemNetworkDriver{} }
func networkStatePath() string {
	return filepath.Join(os.Getenv("ProgramData"), "A7-tagam Print Agent", "network-state.json")
}

func isNetworkAdmin() bool {
	result, _, _ := syscall.NewLazyDLL("shell32.dll").NewProc("IsUserAnAdmin").Call()
	return result != 0
}

func prepareNetworkStateDir() error {
	if !isNetworkAdmin() {
		return errors.New("требуется подтверждение администратора Windows")
	}
	dir := filepath.Dir(networkStatePath())
	if !filepath.IsAbs(dir) {
		return errors.New("не найден системный ProgramData")
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("каталог настроек не может быть ссылкой")
	}
	// Only Administrators and SYSTEM may change the recovery journal. Users
	// can read it for the local settings page. SID notation is locale-neutral.
	out, err := exec.Command("icacls.exe", dir, "/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-545:(OI)(CI)RX").CombinedOutput()
	if err != nil {
		return fmt.Errorf("защита журнала: %s: %w", out, err)
	}
	return nil
}

func replaceNetworkState(from, to string) error {
	f, err := syscall.UTF16PtrFromString(from)
	if err != nil {
		return err
	}
	t, err := syscall.UTF16PtrFromString(to)
	if err != nil {
		return err
	}
	result, _, callErr := syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW").Call(uintptr(unsafe.Pointer(f)), uintptr(unsafe.Pointer(t)), 0x1|0x8)
	if result == 0 {
		return callErr
	}
	return nil
}

func lockNetworkState(path string) (func(), error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	handle, err := syscall.CreateFile(p, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, fmt.Errorf("журнал занят другой настройкой: %w", err)
	}
	return func() { _ = syscall.CloseHandle(handle) }, nil
}

func runPowerShell(ctx context.Context, script string) ([]byte, error) {
	cmd := newPowerShellCommand(ctx, script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return powerShellOutput(cmd)
}

func (systemNetworkDriver) adapters(ctx context.Context) ([]networkAdapter, error) {
	out, err := runPowerShell(ctx, `
$result = @(Get-NetAdapter | ForEach-Object {
  $a = $_
  $ipif = Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
  $ips = @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { "$($_.IPAddress)/$($_.PrefixLength)" })
  $gateways = @(Get-NetRoute -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty NextHop)
  [pscustomobject]@{
    name=$a.Name; index=[int]$a.ifIndex; mac=([string]$a.MacAddress).Replace('-',':').ToLowerInvariant()
    wired=[bool]($a.HardwareInterface -and $a.InterfaceType -eq 6); up=[bool]($a.Status -eq 'Up')
    dhcp=[bool](!$ipif -or $ipif.Dhcp -eq 'Enabled'); gateway=($gateways -join ','); addresses=$ips
  }
})
ConvertTo-Json -InputObject $result -Depth 4 -Compress`)
	if err != nil {
		return nil, err
	}
	var adapters []networkAdapter
	if err = json.Unmarshal(out, &adapters); err != nil {
		return nil, fmt.Errorf("чтение сетевых настроек Windows: %w", err)
	}
	return adapters, nil
}

type windowsNeighborRow struct {
	Address               [28]byte
	InterfaceIndex        uint32
	InterfaceLUID         uint64
	PhysicalAddress       [32]byte
	PhysicalAddressLength uint32
	State                 uint32
	Flags                 uint8
	Padding               [3]byte
	ReachabilityTime      uint32
}

func (systemNetworkDriver) neighbor(ctx context.Context, a networkAdapter, ip netip.Addr) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	row := windowsNeighborRow{InterfaceIndex: uint32(a.Index)}
	binary.LittleEndian.PutUint16(row.Address[:2], syscall.AF_INET)
	b := ip.As4()
	copy(row.Address[4:8], b[:])
	// Pin ARP to this Ethernet using an existing source address. Passing NULL
	// would let Windows choose the internet interface for a missing subnet.
	var source [28]byte
	binary.LittleEndian.PutUint16(source[:2], syscall.AF_INET)
	for _, cidr := range a.Addresses {
		if p, err := netip.ParsePrefix(cidr); err == nil && p.Addr().Is4() {
			b := p.Addr().As4()
			copy(source[4:8], b[:])
			break
		}
	}
	code, _, _ := syscall.NewLazyDLL("iphlpapi.dll").NewProc("ResolveIpNetEntry2").Call(uintptr(unsafe.Pointer(&row)), uintptr(unsafe.Pointer(&source)))
	if code == 0 {
		return row.PhysicalAddressLength > 0, nil
	}
	if code == 67 {
		return false, nil
	} // ERROR_BAD_NET_NAME: no ARP response.
	return false, fmt.Errorf("ARP через Ethernet: %w", syscall.Errno(code))
}

func (systemNetworkDriver) add(ctx context.Context, a networkAdapter, cidr string) error {
	p, err := netip.ParsePrefix(cidr)
	if err != nil {
		return err
	}
	// Never let New-NetIPAddress silently disable DHCP. Recheck inside the
	// privileged command immediately before adding an ActiveStore-only alias.
	script := fmt.Sprintf(`
$i = Get-NetIPInterface -InterfaceIndex %d -AddressFamily IPv4
if ($i.Dhcp -ne 'Disabled') { throw 'DHCP changed; no address was added' }
if (Get-NetRoute -InterfaceIndex %d -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue) { throw 'Ethernet has a default route' }
New-NetIPAddress -InterfaceIndex %d -IPAddress '%s' -PrefixLength %d -AddressFamily IPv4 -PolicyStore ActiveStore -SkipAsSource $false | Out-Null
for ($n=0; $n -lt 20; $n++) {
  $a = Get-NetIPAddress -InterfaceIndex %d -IPAddress '%s' -AddressFamily IPv4
  if ($a.AddressState -eq 'Preferred') { exit 0 }
  if ($a.AddressState -eq 'Duplicate' -or $a.AddressState -eq 'Invalid') { throw 'Duplicate or invalid address detected' }
  Start-Sleep -Milliseconds 250
}
throw 'Duplicate address detection did not finish'`, a.Index, a.Index, a.Index, p.Addr(), p.Bits(), a.Index, p.Addr())
	_, err = runPowerShell(ctx, script)
	return err
}

func (systemNetworkDriver) remove(ctx context.Context, a networkAdapter, cidr string) error {
	p, err := netip.ParsePrefix(cidr)
	if err != nil {
		return err
	}
	script := fmt.Sprintf(`Get-NetIPAddress -InterfaceIndex %d -IPAddress '%s' -AddressFamily IPv4 -PolicyStore ActiveStore -ErrorAction SilentlyContinue | Where-Object { $_.PrefixLength -eq %d } | Remove-NetIPAddress -Confirm:$false -ErrorAction Stop`, a.Index, p.Addr(), p.Bits())
	_, err = runPowerShell(ctx, script)
	return err
}

func elevateNetworkWorker(encoded string) error {
	if isNetworkAdmin() {
		return runNetworkWorker(encoded)
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	script := fmt.Sprintf(`$p = Start-Process -FilePath '%s' -ArgumentList @('-network-worker','%s') -Verb RunAs -Wait -PassThru; if ($p.ExitCode -ne 0) { throw 'Network setup failed; see the saved result in the application' }`, strings.ReplaceAll(exe, "'", "''"), encoded)
	_, err = runPowerShell(ctx, script)
	return err
}

func openNetworkSettings(url string) {
	_, _ = runPowerShell(context.Background(), "Start-Process '"+strings.ReplaceAll(url, "'", "''")+"'")
}
