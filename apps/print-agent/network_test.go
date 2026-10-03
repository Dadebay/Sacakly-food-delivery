package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

type fakeNetworkDriver struct {
	devices        []networkAdapter
	occupied       map[string]bool
	failPort       string
	failRemove     bool
	added, removed []string
	journal        string
	t              *testing.T
}

func (f *fakeNetworkDriver) adapters(context.Context) ([]networkAdapter, error) {
	result := slices.Clone(f.devices)
	for i := range result {
		result[i].Addresses = slices.Clone(result[i].Addresses)
	}
	return result, nil
}
func (f *fakeNetworkDriver) neighbor(_ context.Context, _ networkAdapter, ip netip.Addr) (bool, error) {
	return f.occupied[ip.String()], nil
}
func (f *fakeNetworkDriver) add(_ context.Context, a networkAdapter, cidr string) error {
	state, err := readNetworkState(f.journal)
	if err != nil || !slices.Contains(state.Added, cidr) {
		f.t.Fatalf("mutation without recovery journal: %v", err)
	}
	f.added = append(f.added, cidr)
	for i := range f.devices {
		if f.devices[i].Name == a.Name {
			f.devices[i].Addresses = append(f.devices[i].Addresses, cidr)
		}
	}
	return nil
}
func (f *fakeNetworkDriver) remove(_ context.Context, a networkAdapter, cidr string) error {
	if f.failRemove {
		return errors.New("remove failed")
	}
	f.removed = append(f.removed, cidr)
	for i := range f.devices {
		if f.devices[i].Name == a.Name {
			f.devices[i].Addresses = slices.DeleteFunc(f.devices[i].Addresses, func(v string) bool { return v == cidr })
		}
	}
	return nil
}
func (f *fakeNetworkDriver) check(_ context.Context, target string, source net.IP) error {
	if target == f.failPort {
		return errors.New("port unreachable")
	}
	if source == nil {
		return errors.New("missing explicit LAN source")
	}
	return nil
}

func testNetwork(t *testing.T) (*fakeNetworkDriver, networkRequest, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "state.json")
	driver := &fakeNetworkDriver{t: t, journal: path, devices: []networkAdapter{
		{Name: "Ethernet", Index: 2, MAC: "00:11:22:33:44:55", Wired: true, Up: true, Addresses: []string{"192.168.123.10/24"}},
		{Name: "Wi-Fi", Index: 3, MAC: "00:11:22:33:44:66", Up: true, DHCP: true, Gateway: "172.20.10.1", Addresses: []string{"172.20.10.12/28"}},
	}, occupied: map[string]bool{"192.168.0.86": true}}
	req := networkRequest{Action: "setup", Interface: "Ethernet", MAC: driver.devices[0].MAC, Prefix: 24, Targets: []string{"192.168.0.86:9100", "192.168.123.100:9100"}}
	return driver, req, path
}

func TestNetworkTargetsAreBoundedPrivateEndpoints(t *testing.T) {
	for _, input := range []string{"", "8.8.8.8", "127.0.0.1:9100", "example.com", "192.168.0.86:0", "192.168.0.86:65536", "192.168.0.86:9100;whoami", "[::1]:9100"} {
		if _, err := parseNetworkTargets(input); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
	got, err := parseNetworkTargets("192.168.0.86\n192.168.123.100:9100,192.168.0.86:9100")
	if err != nil || len(got) != 2 {
		t.Fatalf("unexpected targets %v %v", got, err)
	}
}

func TestNetworkSetupKeepsExistingAddressesAndSkipsOccupiedCandidate(t *testing.T) {
	f, req, path := testNetwork(t)
	f.occupied["192.168.0.240"] = true
	wifi := f.devices[1]
	if err := setupNetwork(context.Background(), f, req, path); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(f.added, []string{"192.168.0.241/24"}) {
		t.Fatalf("added %v", f.added)
	}
	if !slices.Contains(f.devices[0].Addresses, "192.168.123.10/24") {
		t.Fatal("old address lost")
	}
	if f.devices[1].Gateway != wifi.Gateway || !f.devices[1].DHCP || !slices.Equal(f.devices[1].Addresses, wifi.Addresses) {
		t.Fatal("Wi-Fi changed")
	}
	state, err := readNetworkState(path)
	if err != nil || state.Status != "active" {
		t.Fatalf("state: %v %v", state, err)
	}
	if !slices.Equal(state.Before.Addresses, []string{"192.168.123.10/24"}) {
		t.Fatal("original snapshot changed")
	}
	if err := rollbackNetwork(context.Background(), f, state, path); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(f.devices[0].Addresses, []string{"192.168.123.10/24"}) {
		t.Fatalf("rollback addresses: %v", f.devices[0].Addresses)
	}
}

func TestNetworkSetupRefusesUnsafeAdaptersAndOverlappingWifi(t *testing.T) {
	for _, scenario := range []string{"dhcp", "gateway", "wireless", "down", "mac-changed", "overlap"} {
		t.Run(scenario, func(t *testing.T) {
			f, req, path := testNetwork(t)
			switch scenario {
			case "dhcp":
				f.devices[0].DHCP = true
			case "gateway":
				f.devices[0].Gateway = "192.168.123.1"
			case "wireless":
				f.devices[0].Wired = false
			case "down":
				f.devices[0].Up = false
			case "mac-changed":
				req.MAC = "00:22:33:44:55:66"
			case "overlap":
				f.devices[1].Addresses = []string{"192.168.0.10/24"}
			}
			if err := setupNetwork(context.Background(), f, req, path); err == nil {
				t.Fatal("expected refusal")
			}
			if len(f.added) > 0 || len(f.removed) > 0 {
				t.Fatal("unsafe adapter mutated")
			}
		})
	}
}

func TestNetworkSetupRequiresPrinterOnSelectedCable(t *testing.T) {
	f, req, path := testNetwork(t)
	delete(f.occupied, "192.168.0.86")
	if err := setupNetwork(context.Background(), f, req, path); err == nil || !strings.Contains(err.Error(), "ARP") {
		t.Fatalf("unexpected result %v", err)
	}
	if len(f.added) > 0 {
		t.Fatal("added address without finding printer")
	}
}

func TestNetworkSetupRollsBackFailedPortCheck(t *testing.T) {
	f, req, path := testNetwork(t)
	f.failPort = "192.168.0.86:9100"
	if err := setupNetwork(context.Background(), f, req, path); err == nil {
		t.Fatal("expected failed port check")
	}
	if !slices.Equal(f.added, f.removed) || len(f.added) != 1 {
		t.Fatalf("rollback mismatch %v %v", f.added, f.removed)
	}
	state, err := readNetworkState(path)
	if err != nil || state.Status != "rolled_back" || len(state.Added) > 0 {
		t.Fatalf("unexpected state %v %v", state, err)
	}
}

func TestNetworkRollbackFailureRetainsRecoveryJournal(t *testing.T) {
	f, req, path := testNetwork(t)
	f.failPort = "192.168.0.86:9100"
	f.failRemove = true
	if err := setupNetwork(context.Background(), f, req, path); err == nil || !strings.Contains(err.Error(), "откат требует внимания") {
		t.Fatalf("missing recovery error %v", err)
	}
	state, err := readNetworkState(path)
	if err != nil || state.Status != "rollback_required" || len(state.Added) != 1 {
		t.Fatalf("recovery journal lost %v %v", state, err)
	}
	f.failRemove = false
	if err := rollbackNetwork(context.Background(), f, state, path); err != nil {
		t.Fatal(err)
	}
}

func TestNetworkStateWriteFailurePreventsMutation(t *testing.T) {
	f, req, path := testNetwork(t)
	path = filepath.Join(path, "missing", "state.json")
	if err := setupNetwork(context.Background(), f, req, path); err == nil {
		t.Fatal("expected failed backup")
	}
	if len(f.added) > 0 {
		t.Fatal("mutated without backup")
	}
}

func TestNetworkReapplyAndRepeatedSetupAreIdempotent(t *testing.T) {
	f, req, path := testNetwork(t)
	if err := setupNetwork(context.Background(), f, req, path); err != nil {
		t.Fatal(err)
	}
	if err := setupNetwork(context.Background(), f, req, path); err != nil {
		t.Fatal(err)
	}
	if len(f.added) != 1 {
		t.Fatal("repeated setup added another address")
	}
	f.devices[0].Addresses = []string{"192.168.123.10/24"} // reboot drops ActiveStore/alias
	if err := setupNetwork(context.Background(), f, req, path); err != nil {
		t.Fatal(err)
	}
	state, err := readNetworkState(path)
	if err != nil || len(state.Added) != 1 || len(state.Before.Addresses) != 1 {
		t.Fatalf("reapply lost ownership %v %v", state, err)
	}
}

func TestNetworkRollbackRefusesDifferentPhysicalAdapter(t *testing.T) {
	f, req, path := testNetwork(t)
	if err := setupNetwork(context.Background(), f, req, path); err != nil {
		t.Fatal(err)
	}
	state, _ := readNetworkState(path)
	f.devices[0].MAC = "00:22:33:44:55:66"
	if err := rollbackNetwork(context.Background(), f, state, path); err == nil {
		t.Fatal("rollback accepted replaced hardware")
	}
	if len(f.removed) > 0 {
		t.Fatal("modified replaced hardware")
	}
}

func TestNetworkStateCannotOwnAnOriginalAddress(t *testing.T) {
	f, req, path := testNetwork(t)
	state := networkState{Version: 1, Request: req, Before: f.devices[0], Added: []string{"192.168.123.10/24"}}
	data, _ := json.Marshal(state)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readNetworkState(path); err == nil {
		t.Fatal("accepted an original address for deletion")
	}
}

func TestCandidateSelectionExcludesLocalPrinterAndReservedHosts(t *testing.T) {
	f, _, _ := testNetwork(t)
	f.devices[1].Addresses = []string{"192.168.0.240/24"}
	list := candidateAddresses(netip.MustParsePrefix("192.168.0.86/24"), f.devices, []string{"192.168.0.241:9100"})
	if len(list) == 0 || list[0].String() != "192.168.0.242" {
		t.Fatalf("bad candidates %v", list)
	}
	for _, ip := range list {
		if ip.String() == "192.168.0.255" {
			t.Fatal("broadcast candidate")
		}
	}
}

func TestARPProbeDoesNotClaimAddressAndRecognizesConflicts(t *testing.T) {
	mac, _ := net.ParseMAC("00:11:22:33:44:55")
	other, _ := net.ParseMAC("00:22:33:44:55:66")
	ip := netip.MustParseAddr("192.168.0.240")
	probe := makeARPProbe(mac, ip)
	if !bytes.Equal(probe[28:32], []byte{0, 0, 0, 0}) {
		t.Fatal("probe claimed a source address")
	}
	if arpClaimsAddress(probe, mac, ip) {
		t.Fatal("self probe treated as conflict")
	}
	peer := makeARPProbe(other, ip)
	if !arpClaimsAddress(peer, mac, ip) {
		t.Fatal("simultaneous probe not detected")
	}
	binary.BigEndian.PutUint16(peer[20:22], 2)
	copy(peer[28:32], ip.AsSlice())
	if !arpClaimsAddress(peer, mac, ip) {
		t.Fatal("ARP reply not detected")
	}
	if arpClaimsAddress(peer[:20], mac, ip) {
		t.Fatal("truncated frame accepted")
	}
}

func localSettingsRequest(method, path string, body io.Reader) *http.Request {
	req := httptest.NewRequest(method, "http://127.0.0.1:17873"+path, body)
	req.RemoteAddr = "127.0.0.1:49000"
	req.Header.Set("Origin", "http://127.0.0.1:17873")
	return req
}

func TestNetworkUIRejectsRemoteOriginsMissingTokenAndRebinding(t *testing.T) {
	manager := newNetworkManager()
	for _, scenario := range []string{"remote-origin", "no-token", "rebind-host", "remote-client"} {
		t.Run(scenario, func(t *testing.T) {
			req := localSettingsRequest(http.MethodPost, "/network/setup", strings.NewReader(`{}`))
			req.Header.Set("X-Network-Token", manager.token)
			switch scenario {
			case "remote-origin":
				req.Header.Set("Origin", "https://a7-tagam.com.tm")
			case "no-token":
				req.Header.Del("X-Network-Token")
			case "rebind-host":
				req.Host = "evil.example:17873"
				req.Header.Del("Origin")
			case "remote-client":
				req.RemoteAddr = "192.168.0.5:12345"
			}
			w := httptest.NewRecorder()
			manager.serveHTTP(w, req)
			if w.Code != http.StatusForbidden {
				t.Fatalf("unexpected status %d", w.Code)
			}
		})
	}
}

func TestNetworkPageContainsWorkingNonceAndEscapesPrinterInput(t *testing.T) {
	manager := newNetworkManager()
	manager.targets = `</textarea><script>alert(1)</script>`
	req := localSettingsRequest(http.MethodGet, "/network", nil)
	req.Header.Del("Origin")
	w := httptest.NewRecorder()
	manager.serveHTTP(w, req)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `nonce="`+manager.token+`"`) {
		t.Fatalf("bad page %d", w.Code)
	}
	if strings.Contains(w.Body.String(), manager.targets) {
		t.Fatal("unescaped HTML")
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("missing frame protection")
	}
}

func TestNetworkPortProbeSendsNoReceiptBytes(t *testing.T) {
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	result := make(chan []byte, 1)
	go func() {
		c, e := l.Accept()
		if e != nil {
			return
		}
		defer c.Close()
		data, _ := io.ReadAll(c)
		result <- data
	}()
	if err := checkNetworkPort(context.Background(), l.Addr().String(), nil); err != nil {
		t.Fatal(err)
	}
	select {
	case data := <-result:
		if len(data) != 0 {
			t.Fatal("probe sent print data")
		}
	case <-time.After(time.Second):
		t.Fatal("probe failed to close connection")
	}
}
