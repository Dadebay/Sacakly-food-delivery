package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type selectivePrinter struct{}

func (selectivePrinter) Print(_ context.Context, job printerJob) (int, error) {
	if job.PrinterIP == "192.168.123.100" {
		return 0, noReceiptBytes(errors.New("нет соединения по LAN"))
	}
	return 1, nil
}

func TestDiagnosticLogDistinguishesMainFailureFromKitchenSuccessWithoutReceiptData(t *testing.T) {
	var logs bytes.Buffer
	handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, selectivePrinter{}).(*agentServer)
	handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	payload := validPrintRequest()
	payload.DispatchID = "PRIVATE_DISPATCH"
	payload.OrderID = "PRIVATE_ORDER_ID"
	payload.Metadata = &receiptMetadata{CustomerName: "PRIVATE_NAME", CustomerPhone: "PRIVATE_PHONE", Address: "PRIVATE_ADDRESS", CustomerNote: "PRIVATE_NOTE"}
	payload.CancellationReason = "PRIVATE_REASON"
	payload.Jobs[0].Items[0].Name = "PRIVATE_DISH"
	payload.Jobs[0].CopyType = "MAIN"
	kitchen := payload.Jobs[0]
	kitchen.PrinterIP, kitchen.CopyType = "192.168.0.86", "KITCHEN"
	payload.Jobs = append(payload.Jobs, kitchen)
	data, _ := json.Marshal(payload)
	request := httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(data))
	request.Header.Set("Origin", "https://a7-tagam.com.tm")
	request.Header.Set("Authorization", "PRIVATE_TOKEN")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("status=%d", response.Code)
	}
	if strings.Contains(logs.String(), "PRIVATE_") {
		t.Fatal("customer, receipt or authentication data leaked into logs")
	}
	events := map[string]map[string]any{}
	for _, line := range bytes.Split(bytes.TrimSpace(logs.Bytes()), []byte{'\n'}) {
		var event map[string]any
		if err := json.Unmarshal(line, &event); err != nil {
			t.Fatal(err)
		}
		events[event["msg"].(string)] = event
	}
	if events["printer_failed"]["target"] != "192.168.123.100:9100" || events["printer_failed"]["copy_type"] != "MAIN" {
		t.Fatal("missing main printer failure")
	}
	if events["printer_sent"]["target"] != "192.168.0.86:9100" || events["printer_sent"]["paper_confirmed"] != false {
		t.Fatal("missing kitchen transport result or false physical-print claim")
	}
	if events["print_completed"]["sent"] != float64(1) || events["print_completed"]["failed"] != float64(1) {
		t.Fatal("missing dispatch summary")
	}
	if events["print_received"]["order_number"] != float64(42) {
		t.Fatal("missing order correlation")
	}
	// Invalid values can contain receipt data inside the validation error.
	logs.Reset()
	payload.Jobs[0].Items[0].Quantity = 0
	data, _ = json.Marshal(payload)
	request = httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(data))
	request.Header.Set("Origin", "https://a7-tagam.com.tm")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if strings.Contains(logs.String(), "PRIVATE_") || !strings.Contains(logs.String(), "invalid_parameters") {
		t.Fatal("validation logging leaked data or omitted rejection")
	}
}

func TestDiagnosticFilesRotateRemainBoundedAndExportOnlyOwnLogs(t *testing.T) {
	dir := t.TempDir()
	w, err := newDiagnosticWriter(dir, 256, 3)
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewJSONHandler(w, nil))
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Go(func() { logger.Info("printer_sent", "copy", 1) })
	}
	wg.Wait()
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	files, err := diagnosticFiles(dir)
	if err != nil || len(files) != 3 {
		t.Fatalf("rotation: files=%d err=%v", len(files), err)
	}
	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil || len(data) > 256 {
			t.Fatal("oversized or unreadable log")
		}
		for _, line := range bytes.Split(bytes.TrimSpace(data), []byte{'\n'}) {
			if !json.Valid(line) {
				t.Fatal("concurrent logging broke a JSON record")
			}
		}
	}
	secret := filepath.Join(t.TempDir(), "secret.txt")
	_ = os.WriteFile(secret, []byte("PRIVATE_SECRET"), 0600)
	_ = os.WriteFile(filepath.Join(dir, "other-file.txt"), []byte("PRIVATE_SECRET"), 0600)
	_ = os.Symlink(secret, filepath.Join(dir, "print-agent-symlink.log"))
	archive := filepath.Join(t.TempDir(), "diagnostics.zip")
	if err := exportDiagnostics(dir, archive); err != nil {
		t.Fatal(err)
	}
	z, err := zip.OpenReader(archive)
	if err != nil {
		t.Fatal(err)
	}
	defer z.Close()
	if len(z.File) != 5 {
		t.Fatalf("unexpected exported files: %d", len(z.File))
	}
	for _, entry := range z.File {
		input, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(input)
		_ = input.Close()
		if err != nil || bytes.Contains(data, []byte("PRIVATE_SECRET")) {
			t.Fatal("invalid export or unrelated data included")
		}
	}
	if exportDiagnostics(dir, archive) == nil {
		t.Fatal("an existing support archive was silently overwritten")
	}
}

func TestDiagnosticExportWorksEvenBeforeFirstAgentLaunch(t *testing.T) {
	if err := exportDiagnostics(filepath.Join(t.TempDir(), "not-started"), filepath.Join(t.TempDir(), "logs.zip")); err != nil {
		t.Fatal(err)
	}
}

func TestFailedConnectionLogsOperatingSystemErrorAndTarget(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().(*net.TCPAddr)
	_ = listener.Close()
	var logs bytes.Buffer
	ctx := context.WithValue(context.Background(), printLogContextKey{}, &printLogContext{logger: slog.New(slog.NewJSONHandler(&logs, nil)).With("target", address.String())})
	printer := &lanPrinter{dialTimeout: time.Second, ioTimeout: time.Second}
	if _, err := printer.dial(ctx, "127.0.0.1", address.Port); err == nil {
		t.Fatal("closed port unexpectedly accepted connection")
	}
	if !strings.Contains(logs.String(), "printer_connect_failed") || !strings.Contains(logs.String(), address.String()) || !strings.Contains(logs.String(), "error") {
		t.Fatal("network failure details were lost")
	}
}
