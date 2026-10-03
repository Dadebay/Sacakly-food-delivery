package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type dispatchPrinter struct {
	calls   []string
	failure map[string]error
	after   func()
}

func (p *dispatchPrinter) Print(_ context.Context, j printerJob) (int, error) {
	p.calls = append(p.calls, j.PrinterIP)
	if p.after != nil {
		p.after()
	}
	return 1, p.failure[j.PrinterIP]
}
func durableServer(t *testing.T, dir string, p jobPrinter) *agentServer {
	t.Helper()
	store, err := openDispatchStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	s := newAgentServer([]string{"https://a7-tagam.com.tm", "http://localhost:3000"}, p).(*agentServer)
	s.dispatches = store
	s.cooldown = 0
	return s
}
func dispatchRequest(s *agentServer, p printRequest) (printResponse, int) {
	data, _ := json.Marshal(p)
	req := httptest.NewRequest("POST", "/v1/print", bytes.NewReader(data))
	req.Header.Set("Origin", "https://a7-tagam.com.tm")
	res := httptest.NewRecorder()
	s.ServeHTTP(res, req)
	var r printResponse
	_ = json.Unmarshal(res.Body.Bytes(), &r)
	return r, res.Code
}
func TestDispatchReplaySurvivesRestartAndDifferentOrigin(t *testing.T) {
	dir := t.TempDir()
	printer := &dispatchPrinter{}
	s := durableServer(t, dir, printer)
	p := validPrintRequest()
	p.AgentID = s.dispatches.agentID
	first, status := dispatchRequest(s, p)
	if status != 200 || len(first.Printed) != 1 {
		t.Fatalf("initial: %+v %d", first, status)
	}
	s.dispatches.Close()
	s = durableServer(t, dir, printer)
	replay, status := s.deliver(t.Context(), "http://localhost:3000", p)
	if status != 200 || !replay.Replayed || len(printer.calls) != 1 || replay.AgentID != first.AgentID || replay.PaperConfirmed {
		t.Fatalf("duplicate after restart: %+v calls=%v", replay, printer.calls)
	}
	p.CancellationReason = "different content"
	_, status = dispatchRequest(s, p)
	if status != 409 || len(printer.calls) != 1 {
		t.Fatal("changed payload reused existing ID")
	}
}
func TestDispatchRetriesOnlyUnsentCopies(t *testing.T) {
	printer := &dispatchPrinter{failure: map[string]error{"192.168.0.86": noReceiptBytes(errors.New("offline"))}}
	dir := t.TempDir()
	s := durableServer(t, dir, printer)
	p := validPrintRequest()
	j := p.Jobs[0]
	j.PrinterIP = "192.168.0.86"
	p.Jobs = append(p.Jobs, j)
	r, status := dispatchRequest(s, p)
	if status != 502 || !r.Retryable || r.Uncertain || len(r.Printed) != 1 {
		t.Fatalf("first %+v", r)
	}
	delete(printer.failure, j.PrinterIP)
	s.dispatches.Close()
	s = durableServer(t, dir, printer)
	r, status = dispatchRequest(s, p)
	if status != 200 || !r.Replayed || len(r.Printed) != 2 || len(printer.calls) != 3 || printer.calls[2] != j.PrinterIP {
		t.Fatalf("resend included successful copy: %+v %v", r, printer.calls)
	}
}
func TestDispatchUnknownResultNeverAutomaticallyResends(t *testing.T) {
	printer := &dispatchPrinter{failure: map[string]error{"192.168.123.100": errors.New("partial TCP write")}}
	dir := t.TempDir()
	s := durableServer(t, dir, printer)
	p := validPrintRequest()
	r, _ := dispatchRequest(s, p)
	if !r.Uncertain || r.Retryable {
		t.Fatal("ambiguous write was retryable")
	}
	s.dispatches.Close()
	s = durableServer(t, dir, printer)
	r, _ = dispatchRequest(s, p)
	if !r.Uncertain || len(printer.calls) != 1 {
		t.Fatal("ambiguous write resent after restart")
	}
	// A deliberate reprint has its own ID. Main+kitchen on one target are also
	// intentionally different copies and must never collapse to just one.
	delete(printer.failure, "192.168.123.100")
	p.DispatchID = "manual-reprint"
	p.Jobs = append(p.Jobs, p.Jobs[0])
	r, status := dispatchRequest(s, p)
	if status != 200 || len(r.Printed) != 2 || len(printer.calls) != 3 {
		t.Fatal("intentional copies lost")
	}
}
func TestDispatchCrashBetweenIntentAndResultFailsClosed(t *testing.T) {
	for _, mode := range []string{"started", "torn", "unavailable"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			printer := &dispatchPrinter{}
			s := durableServer(t, dir, printer)
			p := validPrintRequest()
			j, err := s.dispatches.open("", p)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "started" {
				if err = j.append(dispatchRecord{Copy: 0, State: "started"}); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "torn" {
				_, _ = j.file.WriteString(`{"copy":0,"state":`)
				_ = j.file.Sync()
			}
			_ = j.file.Close()
			if mode == "unavailable" {
				s.dispatches.dir = filepath.Join(dir, "missing")
			}
			r, _ := dispatchRequest(s, p)
			if !r.Uncertain || len(printer.calls) != 0 {
				t.Fatalf("unsafe recovery: %+v", r)
			}
		})
	}
}
func TestConcurrentDispatchesAreSerializedAndDeduplicated(t *testing.T) {
	printer := &dispatchPrinter{}
	s := durableServer(t, t.TempDir(), printer)
	p := validPrintRequest()
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Go(func() {
			r, status := dispatchRequest(s, p)
			if status != 200 || len(r.Printed) != 1 {
				t.Errorf("concurrent request failed: %+v", r)
			}
		})
	}
	wg.Wait()
	if len(printer.calls) != 1 {
		t.Fatalf("printed %d copies", len(printer.calls))
	}
}
func TestLostHTTPResponseReplaysJournalWithoutPrinterIO(t *testing.T) {
	printer := &dispatchPrinter{}
	s := durableServer(t, t.TempDir(), printer)
	var lose atomic.Bool
	lose.Store(true)
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if lose.Swap(false) {
			rec := httptest.NewRecorder()
			s.ServeHTTP(rec, r)
			conn, _, err := w.(http.Hijacker).Hijack()
			if err == nil {
				_ = conn.Close()
			}
			return
		}
		s.ServeHTTP(w, r)
	}))
	defer host.Close()
	send := func() (*http.Response, error) {
		data, _ := json.Marshal(validPrintRequest())
		req, _ := http.NewRequest("POST", host.URL+"/v1/print", bytes.NewReader(data))
		req.Header.Set("Origin", "https://a7-tagam.com.tm")
		return http.DefaultClient.Do(req)
	}
	if res, err := send(); err == nil {
		res.Body.Close()
		t.Fatal("expected dropped HTTP response")
	}
	res, err := send()
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var r printResponse
	_ = json.NewDecoder(res.Body).Decode(&r)
	if res.StatusCode != 200 || !r.Replayed || len(printer.calls) != 1 {
		t.Fatalf("lost response produced duplicate: %+v", r)
	}
}
func TestJournalIsExclusiveAndDoesNotStoreCustomerData(t *testing.T) {
	dir := t.TempDir()
	s := durableServer(t, dir, &dispatchPrinter{})
	if other, err := openDispatchStore(dir); err == nil {
		other.Close()
		t.Fatal("two processes could write one journal")
	}
	p := validPrintRequest()
	p.Metadata = &receiptMetadata{CustomerName: "PRIVATE_CUSTOMER", CustomerPhone: "PRIVATE_PHONE", Address: "PRIVATE_ADDRESS"}
	p.Jobs[0].Items[0].Name = "PRIVATE_DISH"
	dispatchRequest(s, p)
	files, _ := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	for _, f := range files {
		data, _ := os.ReadFile(f)
		if strings.Contains(string(data), "PRIVATE_") {
			t.Fatal("receipt data persisted in journal")
		}
	}
}
func TestChangedAgentIdentityRefusesBeforeSending(t *testing.T) {
	printer := &dispatchPrinter{}
	s := durableServer(t, t.TempDir(), printer)
	p := validPrintRequest()
	p.AgentID = "old-agent-id"
	r, status := dispatchRequest(s, p)
	if status != 409 || !r.Retryable || len(printer.calls) != 0 {
		t.Fatal("replacement installation sent old task")
	}
}
func TestAcceptedSendFinishesAfterBrowserDisconnectAndCooldownSpansOrders(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	printer := &dispatchPrinter{after: cancel}
	s := durableServer(t, t.TempDir(), printer)
	s.cooldown = 25 * time.Millisecond
	p := validPrintRequest()
	p.Jobs = append(p.Jobs, p.Jobs[0])
	r, status := s.deliver(ctx, "", p)
	if status != 200 || len(r.Printed) != 2 {
		t.Fatal("disconnect interrupted accepted dispatch")
	}
	p.DispatchID = "next-order"
	before := time.Now()
	dispatchRequest(s, p)
	if time.Since(before) < 40*time.Millisecond {
		t.Fatal("cooldown missing across dispatches")
	}
}
func TestRealRawTransportClassifiesConnectionFailureAsUnsent(t *testing.T) {
	p := &lanPrinter{dialTimeout: 50 * time.Millisecond, ioTimeout: 50 * time.Millisecond}
	// A closed loopback port is deterministic and does not touch real printers.
	host := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	address := host.Listener.Addr().(*net.TCPAddr)
	host.Close()
	if err := p.sendRaw(t.Context(), "127.0.0.1", address.Port, []byte("test")); !safeToRetry(err) {
		t.Fatalf("connect failure ambiguous: %v", err)
	}
}
