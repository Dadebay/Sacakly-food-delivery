package main

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
)

func TestDesktopStatusTracksOnlyOperationalReceiptMetadata(t *testing.T) {
	status := newDesktopStatus("test-version", defaultListenAddress)
	status.apiConfigured(true)
	status.listening()
	status.apiConnected()
	job := printerJob{PrinterIP: "192.168.123.100", PrinterPort: 9100, Transport: transportRawTCP}
	status.dispatchReceived(42, documentTypeOrder, 2)
	status.copyStarted(42, documentTypeOrder, 1, 2, job)
	status.copySucceeded(42, 1, 2, job)

	snapshot := status.snapshotValue()
	if snapshot.Phase != "PRINTING" || snapshot.CurrentOrder != 42 || snapshot.CopyIndex != 1 || snapshot.CopyCount != 2 {
		t.Fatalf("unexpected active UI state: %+v", snapshot)
	}
	if snapshot.PrinterTarget != "192.168.123.100:9100" || snapshot.SentCopies != 1 || snapshot.FailedCopies != 0 {
		t.Fatalf("unexpected copy result: %+v", snapshot)
	}
	if snapshot.APILastSeen.IsZero() {
		t.Fatal("API contact was not recorded")
	}
	serialized := strings.Join([]string{snapshot.LastMessage, snapshot.PrinterTarget, snapshot.DocumentType}, " ")
	for _, forbidden := range []string{"customer", "phone", "address", "comment", "price", "dispatchId"} {
		if strings.Contains(strings.ToLower(serialized), strings.ToLower(forbidden)) {
			t.Fatalf("UI state leaked receipt content marker %q: %s", forbidden, serialized)
		}
	}

	status.dispatchCompleted(42, 2, 0, false)
	snapshot = status.snapshotValue()
	if snapshot.Phase != "READY" || snapshot.CurrentOrder != 0 || snapshot.PrinterTarget != "" {
		t.Fatalf("completed dispatch remained active: %+v", snapshot)
	}
}

func TestDesktopStatusIsSafeForConcurrentWorkerAndUIAccess(t *testing.T) {
	status := newDesktopStatus("test-version", defaultListenAddress)
	job := printerJob{PrinterIP: "192.168.0.86", PrinterPort: 9100}
	var group sync.WaitGroup
	for worker := 0; worker < 32; worker++ {
		group.Add(1)
		go func(order int) {
			defer group.Done()
			for copyIndex := 1; copyIndex <= 100; copyIndex++ {
				status.apiConnected()
				status.copyStarted(order, documentTypeOrder, copyIndex, 100, job)
				if copyIndex%3 == 0 {
					status.copyFailed(order, copyIndex, 100, job)
				} else {
					status.copySucceeded(order, copyIndex, 100, job)
				}
				_ = status.snapshotValue()
			}
		}(worker + 1)
	}
	group.Wait()
	snapshot := status.snapshotValue()
	if snapshot.SentCopies+snapshot.FailedCopies != 32*100 {
		t.Fatalf("lost concurrent status events: %+v", snapshot)
	}
}

func TestDesktopWindowCannotAccidentallyStopPrinting(t *testing.T) {
	for _, test := range []struct {
		name                    string
		explicitStop, confirmed bool
		want                    bool
	}{
		{name: "window close", confirmed: true},
		{name: "unconfirmed explicit stop", explicitStop: true},
		{name: "confirmed explicit stop", explicitStop: true, confirmed: true, want: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := allowDesktopShutdown(test.explicitStop, test.confirmed); got != test.want {
				t.Fatalf("allowDesktopShutdown(%v, %v) = %v", test.explicitStop, test.confirmed, got)
			}
		})
	}
}

func TestDesktopStatusShowsDirectAPIRecovery(t *testing.T) {
	status := newDesktopStatus("test-version", defaultListenAddress)
	status.apiConfigured(true)
	status.listening()
	status.apiDisconnected()
	if snapshot := status.snapshotValue(); snapshot.Phase != "RETRYING" || !snapshot.APIUnavailable {
		t.Fatalf("API failure is not visible: %+v", snapshot)
	}
	status.apiConnected()
	if snapshot := status.snapshotValue(); snapshot.Phase != "READY" || snapshot.APIUnavailable || snapshot.APILastSeen.IsZero() {
		t.Fatalf("API recovery is not visible: %+v", snapshot)
	}
}

func TestDispatchLifecycleUpdatesDesktopStatus(t *testing.T) {
	server := newAgentServer([]string{"https://a7-tagam.com.tm"}, &fakePrinter{}).(*agentServer)
	server.cooldown = 0
	server.desktopStatus = newDesktopStatus("test-version", defaultListenAddress)
	server.desktopStatus.listening()

	result, responseStatus := server.deliver(context.Background(), "https://a7-tagam.com.tm", validPrintRequest())
	if responseStatus != http.StatusOK || len(result.Printed) != 1 {
		t.Fatalf("unexpected dispatch result: status=%d result=%+v", responseStatus, result)
	}
	snapshot := server.desktopStatus.snapshotValue()
	if snapshot.Phase != "READY" || snapshot.CurrentOrder != 0 || snapshot.SentCopies != 1 || snapshot.FailedCopies != 0 {
		t.Fatalf("desktop status did not finish the dispatch cleanly: %+v", snapshot)
	}
}
