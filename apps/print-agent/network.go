package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Network setup requires locally enabled preparation and native elevation.
// Only additional addresses are owned by the agent.
type networkAdapter struct {
	Name      string   `json:"name"`
	Index     int      `json:"index"`
	MAC       string   `json:"mac"`
	Wired     bool     `json:"wired"`
	Up        bool     `json:"up"`
	DHCP      bool     `json:"dhcp"`
	Gateway   string   `json:"gateway"`
	Addresses []string `json:"addresses"`
}

type networkRequest struct {
	Action    string   `json:"action"`
	Interface string   `json:"interface"`
	MAC       string   `json:"mac"`
	Targets   []string `json:"targets"`
	Prefix    int      `json:"prefix"`
	Reserved  []string `json:"reserved,omitempty"`
}

type networkState struct {
	Version int            `json:"version"`
	Updated time.Time      `json:"updated"`
	Status  string         `json:"status"`
	Request networkRequest `json:"request"`
	Before  networkAdapter `json:"before"`
	Added   []string       `json:"added"`
	Message string         `json:"message"`
}

type networkDriver interface {
	adapters(context.Context) ([]networkAdapter, error)
	neighbor(context.Context, networkAdapter, netip.Addr) (bool, error)
	add(context.Context, networkAdapter, string) error
	remove(context.Context, networkAdapter, string) error
	check(context.Context, string, net.IP) error
}

func (systemNetworkDriver) check(ctx context.Context, target string, source net.IP) error {
	return checkNetworkPort(ctx, target, source)
}

type networkManager struct {
	mu       sync.Mutex
	busy     bool
	token    string
	targets  string
	reserved []string
}

func newNetworkManager() *networkManager {
	return &networkManager{token: randomID()}
}

func randomID() string {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b[:])
}

func parseNetworkTargets(value string) ([]string, error) {
	var targets []string
	for _, raw := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == '\n' || r == ' ' || r == '\r' }) {
		if !strings.Contains(raw, ":") {
			raw += ":9100"
		}
		host, port, err := net.SplitHostPort(raw)
		ip, ipErr := netip.ParseAddr(host)
		p, portErr := strconv.Atoi(port)
		if err != nil || ipErr != nil || !ip.Is4() || !ip.IsPrivate() || portErr != nil || p < 1 || p > 65535 {
			return nil, fmt.Errorf("неверный адрес аппарата %q: нужен частный IPv4 и порт", raw)
		}
		targets = append(targets, net.JoinHostPort(ip.String(), strconv.Itoa(p)))
	}
	slices.Sort(targets)
	targets = slices.Compact(targets)
	if len(targets) == 0 || len(targets) > 51 {
		return nil, errors.New("укажите от 1 до 51 аппарата")
	}
	return targets, nil
}

func validateNetworkRequest(req networkRequest) error {
	if req.Action != "setup" && req.Action != "rollback" {
		return errors.New("неизвестная операция сети")
	}
	if req.Action == "rollback" {
		return nil
	}
	reserved, err := parseReservedAddresses(strings.Join(req.Reserved, ","))
	if err != nil {
		return err
	}
	if !slices.Equal(reserved, req.Reserved) {
		return errors.New("список исключённых IP должен быть отсортирован и не содержать повторений")
	}
	if req.Interface == "" || len(req.Interface) > 128 || strings.ContainsAny(req.Interface, "\x00\r\n") {
		return errors.New("выберите кабельное подключение")
	}
	if mac, err := net.ParseMAC(req.MAC); err != nil || len(mac) != 6 {
		return errors.New("неверный MAC кабельного адаптера")
	}
	if req.Prefix < 24 || req.Prefix > 29 {
		return errors.New("для автоматической настройки поддерживаются маски /24–/29; подтвердите маску аппаратов")
	}
	targets, err := parseNetworkTargets(strings.Join(req.Targets, ","))
	if err != nil {
		return err
	}
	if !slices.Equal(targets, req.Targets) {
		return errors.New("список аппаратов должен содержать уникальные отсортированные IPv4:port")
	}
	return nil
}

func safeNetworkAdapter(a networkAdapter) error {
	if !a.Wired || !a.Up {
		return errors.New("нужен включённый физический Ethernet с подключённым кабелем")
	}
	if a.Gateway != "" {
		return errors.New("на этом Ethernet есть шлюз: он может использоваться для интернета; автоматическое изменение остановлено")
	}
	if a.DHCP {
		return errors.New("Ethernet использует DHCP. Агент не отключает его автоматически: сначала требуется отдельная настройка статического адреса кабеля")
	}
	if len(a.Addresses) == 0 {
		return errors.New("у Ethernet нет исходного IPv4: автоматическая настройка дополнительного адреса невозможна")
	}
	return nil
}

func findAdapter(adapters []networkAdapter, name, mac string) (networkAdapter, error) {
	for _, a := range adapters {
		if a.Name == name && (mac == "" || strings.EqualFold(a.MAC, mac)) {
			return a, nil
		}
	}
	return networkAdapter{}, errors.New("кабельный адаптер изменился или отключён; выполните проверку снова")
}

func targetAddr(target string) netip.Addr {
	host, _, _ := net.SplitHostPort(target)
	ip, _ := netip.ParseAddr(host)
	return ip
}

func localSource(a networkAdapter, target string) net.IP {
	ip := targetAddr(target)
	bestBits := -1
	var source net.IP
	for _, cidr := range a.Addresses {
		p, err := netip.ParsePrefix(cidr)
		if err == nil && p.Contains(ip) && p.Bits() > bestBits {
			bestBits, source = p.Bits(), net.ParseIP(p.Addr().String())
		}
	}
	return source
}

func checkNetworkPort(ctx context.Context, target string, source net.IP) error {
	d := net.Dialer{Timeout: 2 * time.Second}
	if source != nil {
		d.LocalAddr = &net.TCPAddr{IP: source}
	}
	c, err := d.DialContext(ctx, "tcp4", target)
	if err != nil {
		return err
	}
	return c.Close() // Deliberately send zero bytes: this is not a print test.
}

func parseReservedAddresses(value string) ([]string, error) {
	var reserved []string
	for _, raw := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' || r == '\r' }) {
		ip, err := netip.ParseAddr(raw)
		if err != nil || !ip.Is4() || !ip.IsPrivate() {
			return nil, errors.New("в списке исключений нужен частный IPv4 без порта")
		}
		reserved = append(reserved, ip.String())
	}
	if len(reserved) > 64 {
		return nil, errors.New("слишком много исключённых IP")
	}
	slices.Sort(reserved)
	return slices.Compact(reserved), nil
}

func candidateAddresses(prefix netip.Prefix, adapters []networkAdapter, targets []string, reserved ...string) []netip.Addr {
	prefix = prefix.Masked()
	used := map[netip.Addr]bool{}
	for _, a := range adapters {
		for _, raw := range a.Addresses {
			if p, err := netip.ParsePrefix(raw); err == nil {
				used[p.Addr()] = true
			}
		}
	}
	for _, target := range targets {
		used[targetAddr(target)] = true
	}
	for _, raw := range reserved {
		if ip, err := netip.ParseAddr(raw); err == nil {
			used[ip] = true
		}
	}
	base := prefix.Addr().As4()
	size := 1 << (32 - prefix.Bits())
	var candidates []netip.Addr
	// High host addresses avoid the common router/terminal addresses. Every
	// candidate still requires an ARP probe; silence is never a permanent lease.
	for host := size - 16; host < size-1; host++ {
		if host < 2 {
			continue
		}
		b := base
		b[3] += byte(host)
		ip := netip.AddrFrom4(b)
		if !used[ip] {
			candidates = append(candidates, ip)
		}
	}
	return candidates
}

func saveNetworkState(path string, state *networkState) error {
	state.Updated = time.Now().UTC()
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".network-state-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0644); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return replaceNetworkState(name, path)
}

func readNetworkState(path string) (*networkState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var state networkState
	if err = json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	if state.Version != 1 {
		return nil, errors.New("неподдерживаемый формат сохранённых настроек")
	}
	if err = validateNetworkRequest(state.Request); err != nil {
		return nil, err
	}
	for _, raw := range state.Added {
		p, err := netip.ParsePrefix(raw)
		if err != nil || !p.Addr().Is4() || !p.Addr().IsPrivate() || p.Bits() < 24 || p.Bits() > 29 || slices.Contains(state.Before.Addresses, raw) || slices.Contains(state.Request.Reserved, p.Addr().String()) {
			return nil, errors.New("неверный список адресов для отката")
		}
	}
	return &state, nil
}

func rollbackNetwork(ctx context.Context, driver networkDriver, state *networkState, path string) error {
	adapters, err := driver.adapters(ctx)
	if err != nil {
		return err
	}
	a, err := findAdapter(adapters, state.Before.Name, state.Before.MAC)
	if err != nil {
		return err
	}
	var failures []error
	for i := len(state.Added) - 1; i >= 0; i-- {
		cidr := state.Added[i]
		if slices.Contains(a.Addresses, cidr) {
			if err := driver.remove(ctx, a, cidr); err != nil {
				failures = append(failures, err)
				continue
			}
		}
		state.Added = slices.Delete(state.Added, i, i+1)
		if err := saveNetworkState(path, state); err != nil {
			failures = append(failures, err)
		}
	}
	state.Status = "rolled_back"
	if len(failures) > 0 {
		state.Status = "rollback_required"
	}
	state.Message = "Добавленные агентом адреса удалены. Исходные IP, DHCP, шлюзы и DNS не изменялись."
	if len(failures) > 0 {
		state.Message = "Не все дополнительные адреса удалось удалить. Журнал сохранён; требуется повторный откат."
	}
	if err := saveNetworkState(path, state); err != nil {
		failures = append(failures, err)
	}
	return errors.Join(failures...)
}

func setupNetwork(ctx context.Context, driver networkDriver, req networkRequest, path string) (resultErr error) {
	if err := validateNetworkRequest(req); err != nil {
		return err
	}
	adapters, err := driver.adapters(ctx)
	if err != nil {
		return err
	}
	a, err := findAdapter(adapters, req.Interface, req.MAC)
	if err != nil {
		return err
	}
	if err = safeNetworkAdapter(a); err != nil {
		return err
	}
	state := &networkState{Version: 1, Status: "pending", Request: req, Before: a, Added: []string{}}
	if old, readErr := readNetworkState(path); readErr == nil && len(old.Added) > 0 && old.Status != "rolled_back" {
		if old.Before.MAC != a.MAC || old.Request.Prefix != req.Prefix || !slices.Equal(old.Request.Targets, req.Targets) {
			return errors.New("есть предыдущая настройка: сначала выполните её откат")
		}
		req.Reserved, err = parseReservedAddresses(strings.Join(append(slices.Clone(req.Reserved), old.Request.Reserved...), ","))
		if err != nil {
			return err
		}
		for _, raw := range old.Added {
			p, _ := netip.ParsePrefix(raw)
			if slices.Contains(req.Reserved, p.Addr().String()) {
				return errors.New("ранее добавленный IP теперь исключён; сначала откатите прежнюю настройку")
			}
		}
		// Reapply after reboot, keeping ownership and the original snapshot.
		state = old
		state.Request, state.Status = req, "pending"
	} else if readErr != nil && !os.IsNotExist(readErr) {
		return readErr
	}
	if err = saveNetworkState(path, state); err != nil {
		return err
	}
	defer func() {
		if resultErr == nil {
			return
		}
		rollbackCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if rollbackErr := rollbackNetwork(rollbackCtx, driver, state, path); rollbackErr != nil {
			resultErr = errors.Join(resultErr, fmt.Errorf("откат требует внимания: %w", rollbackErr))
		}
		state.Message = resultErr.Error()
		_ = saveNetworkState(path, state)
	}()
	var previouslyReachable []string
	for _, target := range req.Targets {
		if source := localSource(a, target); source != nil && driver.check(ctx, target, source) == nil {
			previouslyReachable = append(previouslyReachable, target)
		}
	}
	processed := map[netip.Prefix]bool{}
	for _, target := range req.Targets {
		ip := targetAddr(target)
		prefix := netip.PrefixFrom(ip, req.Prefix).Masked()
		if localSource(a, target) != nil || processed[prefix] {
			continue
		}
		processed[prefix] = true
		for _, other := range adapters {
			if other.Name == a.Name || !other.Up {
				continue
			}
			for _, cidr := range other.Addresses {
				if existing, err := netip.ParsePrefix(cidr); err == nil && existing.Overlaps(prefix) {
					return fmt.Errorf("сеть %s уже используется подключением %s; автоматическая настройка остановлена, чтобы сохранить интернет", prefix, other.Name)
				}
			}
		}
		present, err := driver.neighbor(ctx, a, ip)
		if err != nil {
			return fmt.Errorf("проверка аппарата %s через кабель: %w", ip, err)
		}
		if !present {
			return fmt.Errorf("аппарат %s не ответил на ARP через %s; проверьте его IP, питание и подключение к этому switch", ip, a.Name)
		}
		var selected netip.Addr
		for _, candidate := range candidateAddresses(prefix, adapters, req.Targets, req.Reserved...) {
			occupied, err := driver.neighbor(ctx, a, candidate)
			if err != nil {
				return fmt.Errorf("проверка свободного IP: %w", err)
			}
			if !occupied {
				selected = candidate
				break
			}
		}
		if !selected.IsValid() {
			return fmt.Errorf("свободный адрес в %s не найден", prefix)
		}
		cidr := netip.PrefixFrom(selected, req.Prefix).String()
		fresh, err := driver.adapters(ctx)
		if err != nil {
			return err
		}
		current, err := findAdapter(fresh, a.Name, a.MAC)
		if err != nil {
			return err
		}
		if err = safeNetworkAdapter(current); err != nil {
			return err
		}
		expected, actual := slices.Clone(a.Addresses), slices.Clone(current.Addresses)
		slices.Sort(expected)
		slices.Sort(actual)
		if !slices.Equal(expected, actual) {
			return errors.New("адреса Ethernet изменились во время проверки; настройка остановлена")
		}
		if !slices.Contains(state.Added, cidr) {
			state.Added = append(state.Added, cidr)
		}
		// Journal after conflict checks, but before mutation, so an interrupted
		// helper remains recoverable without claiming an already existing IP.
		if err = saveNetworkState(path, state); err != nil {
			return err
		}
		if err = driver.add(ctx, current, cidr); err != nil {
			return err
		}
		log.Printf("Для аппаратов добавлен IP %s; исходные адреса Ethernet сохранены", cidr)
		a.Addresses = append(a.Addresses, cidr)
		for _, peer := range req.Targets {
			if prefix.Contains(targetAddr(peer)) {
				if err = driver.check(ctx, peer, net.ParseIP(selected.String())); err != nil {
					return fmt.Errorf("%s по кабелю недоступен после настройки: %w", peer, err)
				}
			}
		}
	}
	for _, target := range previouslyReachable {
		if err = driver.check(ctx, target, localSource(a, target)); err != nil {
			return fmt.Errorf("потеряна ранее работавшая связь с %s: %w", target, err)
		}
	}
	// Every requested endpoint must pass, even if no new address was necessary.
	for _, target := range req.Targets {
		if source := localSource(a, target); source == nil {
			return fmt.Errorf("нет кабельного адреса для %s", target)
		} else if err = driver.check(ctx, target, source); err != nil {
			return fmt.Errorf("%s недоступен: %w", target, err)
		} else {
			log.Printf("Аппарат %s доступен через %s; чек не отправлялся", target, source)
		}
	}
	state.Status, state.Message = "active", "Связь с выбранными аппаратами проверена без печати. Настройка восстановится при запуске агента после перезагрузки."
	return saveNetworkState(path, state)
}

func runNetworkWorker(encoded string) error {
	if len(encoded) > 20000 {
		return errors.New("слишком большой запрос")
	}
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return err
	}
	var req networkRequest
	if err = json.Unmarshal(data, &req); err != nil {
		return err
	}
	if err = validateNetworkRequest(req); err != nil {
		return err
	}
	if err = prepareNetworkStateDir(); err != nil {
		return err
	}
	path := networkStatePath()
	unlock, err := lockNetworkState(path + ".lock")
	if err != nil {
		return err
	}
	defer unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	driver := newSystemNetworkDriver()
	if req.Action == "rollback" {
		state, err := readNetworkState(path)
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			return err
		}
		return rollbackNetwork(ctx, driver, state, path)
	}
	return setupNetwork(ctx, driver, req, path)
}

func (manager *networkManager) perform(req networkRequest) error {
	manager.mu.Lock()
	if manager.busy {
		manager.mu.Unlock()
		return errors.New("настройка уже выполняется")
	}
	manager.busy = true
	manager.mu.Unlock()
	defer func() { manager.mu.Lock(); manager.busy = false; manager.mu.Unlock() }()
	if err := validateNetworkRequest(req); err != nil {
		return err
	}
	data, _ := json.Marshal(req)
	return elevateNetworkWorker(base64.RawURLEncoding.EncodeToString(data))
}

func (manager *networkManager) command(action, iface, targets string, prefix int) error {
	if action == "check" {
		report, err := manager.diagnose(context.Background(), targets)
		if err != nil {
			return err
		}
		b, _ := json.MarshalIndent(report, "", "  ")
		fmt.Println(string(b))
		return nil
	}
	req := networkRequest{Action: action, Interface: iface, Prefix: prefix, Reserved: slices.Clone(manager.reserved)}
	if action == "setup" {
		var err error
		if req.Targets, err = parseNetworkTargets(targets); err != nil {
			return err
		}
		adapters, err := newSystemNetworkDriver().adapters(context.Background())
		if err != nil {
			return err
		}
		a, err := findAdapter(adapters, iface, "")
		if err != nil {
			return err
		}
		if err = safeNetworkAdapter(a); err != nil {
			return err
		}
		req.MAC = a.MAC
	}
	started := time.Now().UTC()
	if err := manager.perform(req); err != nil {
		if state, readErr := readNetworkState(networkStatePath()); readErr == nil && !state.Updated.Before(started) && state.Status != "active" && state.Message != "" {
			return fmt.Errorf("%s: %w", state.Message, err)
		}
		return err
	}
	return reportNetworkCommand(action, networkStatePath(), os.Stdout)
}

func reportNetworkCommand(action, path string, output io.Writer) error {
	state, err := readNetworkState(path)
	if action == "rollback" && os.IsNotExist(err) {
		_, err = fmt.Fprintln(output, "Настройка подключения ещё не применялась. Откатывать нечего.")
		return err
	}
	if err == nil {
		b, _ := json.MarshalIndent(state, "", "  ")
		_, err = fmt.Fprintln(output, string(b))
	}
	return err
}

func (manager *networkManager) restore() {
	state, err := readNetworkState(networkStatePath())
	if err != nil || state.Status != "active" || len(state.Added) == 0 {
		return
	}
	adapters, err := newSystemNetworkDriver().adapters(context.Background())
	if err != nil {
		log.Printf("Восстановление сети: %v", err)
		return
	}
	a, err := findAdapter(adapters, state.Before.Name, state.Before.MAC)
	if err != nil {
		log.Printf("Восстановление сети: %v", err)
		return
	}
	for _, cidr := range state.Added {
		if !slices.Contains(a.Addresses, cidr) {
			log.Print("Восстанавливаю ранее сохранённую настройку сети аппаратов; может потребоваться системное подтверждение.")
			if err := manager.perform(state.Request); err != nil {
				log.Printf("Восстановление сети: %v", err)
			}
			return
		}
	}
}
