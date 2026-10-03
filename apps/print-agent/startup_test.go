package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestRollbackWithoutPriorSetupHasNoMissingFileError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "network-state.json")
	var output bytes.Buffer
	if err := reportNetworkCommand("rollback", path, &output); err != nil || !strings.Contains(output.String(), "Откатывать нечего") {
		t.Fatalf("unused rollback treated as broken settings: %s %v", output.String(), err)
	}
	if err := reportNetworkCommand("setup", path, &output); err == nil {
		t.Fatal("missing setup journal was ignored")
	}
}

func TestPackagedWindowsLaunchEnablesPreparationWithoutCMD(t *testing.T) {
	options, err := networkLaunchDefaults("windows", "Ethernet", "192.168.123.10,192.168.0.240")
	if err != nil || !options.Enabled || options.Interface != "Ethernet" || options.Prefix != 24 || len(options.Reserved) != 2 {
		t.Fatalf("ordinary packaged EXE lacks network mode: %+v %v", options, err)
	}
	for _, goos := range []string{"darwin", "linux"} {
		options, err := networkLaunchDefaults(goos, "Ethernet", "192.168.123.10,192.168.0.240")
		if err != nil || options.Enabled || options.Interface != "" || len(options.Reserved) != 0 {
			t.Fatalf("Windows release settings leaked to %s: %+v %v", goos, options, err)
		}
	}
	options, err = networkLaunchDefaults("windows", "", "")
	if err != nil || options.Enabled {
		t.Fatalf("generic build unexpectedly enabled preparation: %+v %v", options, err)
	}
	if _, err := networkLaunchDefaults("windows", "Ethernet", "8.8.8.8"); err == nil {
		t.Fatal("invalid packaged reservation accepted")
	}
}

func TestSecondLaunchChecksRunningModeWithoutSendingAReceipt(t *testing.T) {
	wanted, _ := networkLaunchDefaults("windows", "Ethernet", "192.168.123.10,192.168.0.240")
	printer := &fakePrinter{}
	handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, printer).(*agentServer)
	handler.networkLaunch = wanted
	prepared := false
	handler.prepareNetwork = func(context.Context, []printerJob) error { prepared = true; return nil }
	server := httptest.NewServer(handler)
	defer server.Close()
	health, err := readRunningAgent(context.Background(), strings.TrimPrefix(server.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	if message, ready := runningAgentNotice(health, version, wanted); !ready || !strings.Contains(message, "уже работает") {
		t.Fatalf("matching instance was treated as failed: %s %v", message, ready)
	}
	if len(printer.jobs) != 0 || prepared {
		t.Fatal("second launch triggered printing or network preparation")
	}
	for _, change := range []func(*agentHealth){
		func(h *agentHealth) { h.Version = "older-version" },
		func(h *agentHealth) { h.NetworkPreparation.Enabled = false },
		func(h *agentHealth) { h.NetworkPreparation.Interface = "Other Ethernet" },
		func(h *agentHealth) { h.NetworkPreparation.Prefix = 25 },
		func(h *agentHealth) { h.NetworkPreparation.Reserved = nil },
		func(h *agentHealth) { h.Application = "unrelated service" },
		func(h *agentHealth) { h.Status = "failed" },
	} {
		changed := health
		change(&changed)
		if message, ready := runningAgentNotice(changed, version, wanted); ready || !strings.Contains(message, "Закройте") {
			t.Fatalf("incompatible instance reported ready: %s %v", message, ready)
		}
	}
}

func TestRunningAgentCheckIsBoundedReadOnlyAndDoesNotFollowRedirects(t *testing.T) {
	var redirected atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirected.Add(1) }))
	defer target.Close()
	for _, response := range []string{"redirect", "malformed", "oversize", "failure"} {
		t.Run(response, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.URL.Path != "/health" {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
				switch response {
				case "redirect":
					http.Redirect(w, r, target.URL, http.StatusFound)
				case "malformed":
					_, _ = w.Write([]byte("not JSON"))
				case "oversize":
					_, _ = w.Write([]byte(strings.Repeat(" ", 8193)))
				case "failure":
					w.WriteHeader(http.StatusServiceUnavailable)
				}
			}))
			defer server.Close()
			if _, err := readRunningAgent(context.Background(), strings.TrimPrefix(server.URL, "http://")); err == nil {
				t.Fatal("invalid status accepted")
			}
		})
	}
	if redirected.Load() != 0 {
		t.Fatal("status check followed a redirect")
	}
	if _, err := readRunningAgent(context.Background(), "192.168.123.100:9100"); err == nil {
		t.Fatal("status check allowed a printer address")
	}
}

func TestBrowserContactLogDistinguishesStatusAndPreflightFromPrint(t *testing.T) {
	var output bytes.Buffer
	printer := &fakePrinter{}
	handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, printer).(*agentServer)
	handler.logger = slog.New(slog.NewJSONHandler(&output, nil))
	for _, origin := range []string{"", "https://evil.example"} {
		r := httptest.NewRequest(http.MethodGet, "/health", nil)
		r.Header.Set("Origin", origin)
		handler.ServeHTTP(httptest.NewRecorder(), r)
	}
	if output.Len() != 0 {
		t.Fatal("local or rejected health probe logged as A7-tagam browser")
	}
	for i := 0; i < 3; i++ {
		for _, pair := range [][2]string{{http.MethodGet, "/health"}, {http.MethodOptions, "/v1/print"}} {
			r := httptest.NewRequest(pair[0], pair[1], nil)
			r.Header.Set("Origin", "https://a7-tagam.com.tm")
			handler.ServeHTTP(httptest.NewRecorder(), r)
		}
	}
	counts := map[string]int{}
	for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		counts[event["msg"].(string)]++
	}
	if counts["browser_connected"] != 1 || counts["browser_print_preflight"] != 1 || len(counts) != 2 || len(printer.jobs) != 0 {
		t.Fatalf("incorrect browser activity log: %s", output.String())
	}
}
