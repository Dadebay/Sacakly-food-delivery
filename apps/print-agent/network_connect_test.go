package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
)

func TestPrinterNetworkUsesActualOrderTargetsAndKeepsExistingEthernet(t *testing.T) {
	f, _, _ := testNetwork(t)
	f.devices[0].Addresses = []string{"192.168.123.21/24"}
	jobs := validPrintRequest().Jobs
	kitchen := jobs[0]
	kitchen.PrinterIP = "192.168.0.83" // Must use this order, not a baked-in .86.
	jobs = append(jobs, kitchen, kitchen)
	req, err := printerNetworkRequest(f.devices, "Ethernet", 24, []string{"192.168.0.240", "192.168.123.10"}, jobs)
	if err != nil || req == nil || !slices.Equal(req.Targets, []string{"192.168.0.83:9100", "192.168.123.100:9100"}) || req.MAC != f.devices[0].MAC {
		t.Fatalf("order routing was not preserved: %+v %v", req, err)
	}
	f.devices[0].Addresses = append(f.devices[0].Addresses, "192.168.0.241/24")
	req, err = printerNetworkRequest(f.devices, "Ethernet", 24, nil, jobs)
	if err != nil || req != nil {
		t.Fatalf("already configured network requires no elevation: %+v %v", req, err)
	}
}

func TestReservedOfflineMacAddressIsNeverAssignedAndSurvivesRestore(t *testing.T) {
	f, req, path := testNetwork(t)
	f.devices[0].Addresses = []string{"192.168.123.21/24"}
	req.Reserved = []string{"192.168.0.240", "192.168.123.10"}
	if err := setupNetwork(t.Context(), f, req, path); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(f.added, []string{"192.168.0.241/24"}) || !slices.Contains(f.devices[0].Addresses, "192.168.123.21/24") {
		t.Fatalf("occupied/reserved/original address changed: %v", f.devices)
	}
	state, err := readNetworkState(path)
	if err != nil || !slices.Equal(state.Request.Reserved, req.Reserved) {
		t.Fatalf("reservation was not saved: %+v %v", state, err)
	}
	f.devices[0].Addresses = []string{"192.168.123.21/24"} // Runtime alias lost at reboot.
	if err := setupNetwork(t.Context(), f, state.Request, path); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(f.added, []string{"192.168.0.241/24", "192.168.0.241/24"}) {
		t.Fatalf("restore reused an offline Mac address: %v", f.added)
	}
	state, _ = readNetworkState(path)
	if err := rollbackNetwork(t.Context(), f, state, path); err != nil || !slices.Equal(f.devices[0].Addresses, []string{"192.168.123.21/24"}) {
		t.Fatalf("rollback changed the user-configured Ethernet IP: %v", err)
	}
}

func TestNetworkRejectsMalformedReservationsAndCannotOwnReservedAddress(t *testing.T) {
	for _, reserved := range [][]string{{"8.8.8.8"}, {"192.168.0.240,192.168.0.241"}, {"192.168.0.240", "192.168.0.240"}} {
		_, req, _ := testNetwork(t)
		req.Reserved = reserved
		if validateNetworkRequest(req) == nil {
			t.Fatalf("accepted malformed reservations %v", reserved)
		}
	}
	f, req, path := testNetwork(t)
	req.Reserved = []string{"192.168.0.240"}
	state := networkState{Version: 1, Request: req, Before: f.devices[0], Added: []string{"192.168.0.240/24"}}
	if err := saveNetworkState(path, &state); err != nil {
		t.Fatal(err)
	}
	if _, err := readNetworkState(path); err == nil {
		t.Fatal("journal claimed a reserved Mac address")
	}
}

func TestConcurrentPrinterPlansPrepareNetworkOnlyOnce(t *testing.T) {
	f, _, _ := testNetwork(t)
	jobs := validPrintRequest().Jobs
	jobs[0].PrinterIP = "192.168.0.83"
	configured := 0
	p := &printerNetworkPreparer{iface: "Ethernet", prefix: 24, adapters: f.adapters, configure: func(req networkRequest) error {
		configured++
		f.devices[0].Addresses = append(f.devices[0].Addresses, "192.168.0.241/24")
		return nil
	}}
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			if err := p.prepare(t.Context(), jobs); err != nil && !errors.Is(err, errPrinterNetworkPreparing) {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	p.mu.Lock()
	task := p.pending
	p.mu.Unlock()
	if task != nil {
		<-task.done
	}
	if err := p.prepare(t.Context(), jobs); err != nil {
		t.Fatal(err)
	}
	if configured != 1 {
		t.Fatalf("requested %d configuration prompts", configured)
	}
}

func TestNetworkSetupReturnsBeforeElevationAndPrintsOnlyOnDeliberateRetry(t *testing.T) {
	f, _, _ := testNetwork(t)
	ready := make(chan struct{})
	defer func() {
		select {
		case <-ready:
		default:
			close(ready)
		}
	}()
	p := &printerNetworkPreparer{iface: "Ethernet", prefix: 24, adapters: f.adapters, configure: func(networkRequest) error {
		<-ready
		f.devices[0].Addresses = append(f.devices[0].Addresses, "192.168.0.241/24")
		return nil
	}}
	printer := &fakePrinter{}
	handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, printer).(*agentServer)
	handler.prepareNetwork = p.prepare
	payload := validPrintRequest()
	payload.Jobs[0].PrinterIP = "192.168.0.83"
	body, _ := json.Marshal(payload)
	send := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(body))
		req.Header.Set("Origin", "https://a7-tagam.com.tm")
		r := httptest.NewRecorder()
		handler.ServeHTTP(r, req)
		return r
	}
	if r := send(); r.Code != http.StatusBadGateway || len(printer.jobs) != 0 {
		t.Fatalf("printed while waiting for Windows confirmation: %d", r.Code)
	}
	if r := send(); r.Code != http.StatusBadGateway || len(printer.jobs) != 0 {
		t.Fatal("queued an automatic retry during setup")
	}
	task := p.pending
	close(ready)
	<-task.done
	if len(printer.jobs) != 0 {
		t.Fatal("printed late after configuration completed")
	}
	if r := send(); r.Code != http.StatusOK || len(printer.jobs) != 1 {
		t.Fatalf("deliberate retry did not print once: %d", r.Code)
	}
}

func TestPrintWaitsForNetworkAndNeverSendsAfterFailedOrCancelledSetup(t *testing.T) {
	for _, mode := range []string{"ready", "failed", "cancelled"} {
		t.Run(mode, func(t *testing.T) {
			printer := &fakePrinter{}
			handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, printer).(*agentServer)
			payload := validPrintRequest()
			kitchen := payload.Jobs[0]
			kitchen.PrinterIP = "192.168.0.83"
			payload.Jobs = append(payload.Jobs, kitchen)
			body, _ := json.Marshal(payload)
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			called := false
			handler.prepareNetwork = func(_ context.Context, jobs []printerJob) error {
				called = true
				if len(printer.jobs) != 0 || len(jobs) != 2 || jobs[1].PrinterIP != "192.168.0.83" {
					t.Fatal("printing started before setup or order targets were changed")
				}
				if mode == "failed" {
					return errors.New("network setup failed")
				}
				if mode == "cancelled" {
					cancel()
				}
				return nil
			}
			req := httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(body)).WithContext(ctx)
			req.Header.Set("Origin", "https://a7-tagam.com.tm")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			if !called {
				t.Fatal("explicit setup was skipped")
			}
			if mode == "ready" {
				if response.Code != http.StatusOK || len(printer.jobs) != 2 {
					t.Fatalf("ready order was not printed exactly once: %d %+v", response.Code, printer.jobs)
				}
			} else if response.Code != http.StatusBadGateway || len(printer.jobs) != 0 {
				t.Fatalf("sent a receipt after setup failure/cancellation: %d %+v", response.Code, printer.jobs)
			}
		})
	}
}

func TestRejectedRequestCannotTriggerOptInNetworkPreparation(t *testing.T) {
	for _, mode := range []string{"origin", "public-ip"} {
		printer := &fakePrinter{}
		handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, printer).(*agentServer)
		handler.prepareNetwork = func(context.Context, []printerJob) error {
			t.Fatal("untrusted request triggered network setup")
			return nil
		}
		payload := validPrintRequest()
		origin := "https://evil.example"
		if mode == "public-ip" {
			origin = "https://a7-tagam.com.tm"
			payload.Jobs[0].PrinterIP = "8.8.8.8"
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(body))
		req.Header.Set("Origin", origin)
		handler.ServeHTTP(httptest.NewRecorder(), req)
	}
}
