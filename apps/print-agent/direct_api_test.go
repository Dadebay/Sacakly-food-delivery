package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestDirectAPIPrintsWithoutBrowserAndReplaysAfterLostOutcome(t *testing.T) {
	const (
		taskID = "22222222-2222-4222-8222-222222222222"
		token  = "standalone-receipt-agent-test-token-123456789"
	)
	printer := &fakePrinter{}
	dispatchDirectory := t.TempDir()
	agent := durableServer(t, dispatchDirectory, printer)
	stationID := agent.dispatches.agentID
	requestTemplate := validPrintRequest()
	requestTemplate.DispatchID = "33333333-3333-4333-8333-333333333333"
	requestTemplate.AgentID = stationID
	mainJob := requestTemplate.Jobs[0]
	plan := directReceiptPlan{
		OrderID: requestTemplate.OrderID, OrderNumber: requestTemplate.OrderNumber,
		DocumentType: requestTemplate.DocumentType, Summary: requestTemplate.Summary,
		MainJob: &mainJob,
	}
	var outcomes atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer "+token {
			http.Error(writer, "unauthorized", http.StatusUnauthorized)
			return
		}
		if request.Header.Get("X-Receipt-Agent-Id") != stationID {
			http.Error(writer, "wrong station", http.StatusBadRequest)
			return
		}
		switch request.URL.Path {
		case "/api/v1/receipt-agent/tasks/claim":
			_ = json.NewEncoder(writer).Encode(directClaimResult{Task: &directReceiptTask{
				ID: taskID, OrderID: plan.OrderID, StationID: stationID,
				DispatchID: requestTemplate.DispatchID, ClaimToken: "44444444-4444-4444-8444-444444444444", Plan: plan,
			}})
		case "/api/v1/receipt-agent/tasks/" + taskID + "/outcome":
			var outcome directOutcome
			_ = json.NewDecoder(request.Body).Decode(&outcome)
			if outcome.Outcome != "DELIVERED" || outcome.ErrorCode != "" {
				t.Errorf("unexpected outcome: %+v", outcome)
			}
			if outcomes.Add(1) == 1 {
				http.Error(writer, "simulated lost acknowledgment", http.StatusInternalServerError)
				return
			}
			writer.WriteHeader(http.StatusCreated)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer api.Close()

	status := newDesktopStatus("test", defaultListenAddress)
	status.apiConfigured(true)
	status.listening()
	worker, err := newDirectAPIWorker(api.URL+"/api/v1", token, stationID, agent, status, slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	worker.client = api.Client()
	worker.heartbeatPeriod = time.Hour

	if err = worker.consumeOnce(context.Background()); err == nil {
		t.Fatal("lost API acknowledgment was treated as success")
	}
	// Simulate the operator restarting the EXE while the internet/API outcome
	// acknowledgment is lost. The persistent journal must still suppress paper.
	agent.dispatches.Close()
	worker.agent = durableServer(t, dispatchDirectory, printer)
	if err = worker.consumeOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(printer.jobs) != 1 {
		t.Fatalf("journal did not prevent a duplicate receipt: %d sends", len(printer.jobs))
	}
	if outcomes.Load() != 2 {
		t.Fatalf("outcome was not retried: %d", outcomes.Load())
	}
}

func TestDirectAPIRecoversAfterInternetOutageBeforeClaim(t *testing.T) {
	const (
		taskID = "55555555-5555-4555-8555-555555555555"
		token  = "standalone-receipt-agent-outage-token-123456789"
	)
	printer := &fakePrinter{}
	agent := durableServer(t, t.TempDir(), printer)
	stationID := agent.dispatches.agentID
	requestTemplate := validPrintRequest()
	requestTemplate.DispatchID = "66666666-6666-4666-8666-666666666666"
	requestTemplate.AgentID = stationID
	mainJob := requestTemplate.Jobs[0]
	plan := directReceiptPlan{
		OrderID: requestTemplate.OrderID, OrderNumber: requestTemplate.OrderNumber,
		DocumentType: requestTemplate.DocumentType, Summary: requestTemplate.Summary,
		MainJob: &mainJob,
	}
	var online atomic.Bool
	api := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !online.Load() {
			http.Error(writer, "offline", http.StatusServiceUnavailable)
			return
		}
		if request.Header.Get("X-Receipt-Agent-Id") != stationID {
			http.Error(writer, "wrong station", http.StatusBadRequest)
			return
		}
		switch request.URL.Path {
		case "/api/v1/receipt-agent/tasks/claim":
			_ = json.NewEncoder(writer).Encode(directClaimResult{Task: &directReceiptTask{
				ID: taskID, OrderID: plan.OrderID, StationID: stationID,
				DispatchID: requestTemplate.DispatchID, ClaimToken: "77777777-7777-4777-8777-777777777777", Plan: plan,
			}})
		case "/api/v1/receipt-agent/tasks/" + taskID + "/outcome":
			writer.WriteHeader(http.StatusCreated)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer api.Close()

	status := newDesktopStatus("test", defaultListenAddress)
	status.apiConfigured(true)
	status.listening()
	worker, err := newDirectAPIWorker(api.URL+"/api/v1", token, stationID, agent, status, slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	worker.client = api.Client()
	worker.heartbeatPeriod = time.Hour

	if err = worker.consumeOnce(context.Background()); err == nil {
		t.Fatal("offline API was treated as a claimed receipt")
	}
	if len(printer.jobs) != 0 {
		t.Fatal("receipt printed without a server claim")
	}
	online.Store(true)
	if err = worker.consumeOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(printer.jobs) != 1 {
		t.Fatalf("receipt did not resume exactly once after recovery: %d", len(printer.jobs))
	}
}

func TestDirectPlanKeepsMainAndKitchenAsIntentionalCopies(t *testing.T) {
	mainJob := validPrintRequest().Jobs[0]
	kitchenJob := mainJob
	plan := directReceiptPlan{
		OrderID: "00000000-0000-4000-8000-000000000001", OrderNumber: 42,
		DocumentType: documentTypeOrder, Summary: validPrintRequest().Summary,
		MainJob: &mainJob, Jobs: []printerJob{kitchenJob},
	}
	payload := plan.printRequest("dispatch", "agent")
	if len(payload.Jobs) != 2 || payload.Jobs[0].CopyType != "MAIN" || payload.Jobs[1].CopyType != "KITCHEN" {
		t.Fatalf("receipt copies were collapsed or mislabeled: %+v", payload.Jobs)
	}
}

func TestDirectAPIBaseURLRejectsCredentialsAndQuery(t *testing.T) {
	for _, value := range []string{
		"https://user:secret@example.com/api/v1",
		"https://example.com/api/v1?token=secret",
		"http://example.com/api/v1",
		"file:///tmp/api",
	} {
		if _, err := normalizeDirectAPIBaseURL(value); err == nil {
			t.Fatalf("unsafe API URL accepted: %s", value)
		}
	}
}
