package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultAPIBaseURL        = "https://a7-tagam.com.tm/api/v1"
	directAPIPollInterval    = 3 * time.Second
	directAPIHeartbeatPeriod = 30 * time.Second
	directAPIResponseLimit   = 1 << 20
)

type directReceiptPlan struct {
	OrderID            string           `json:"orderId"`
	OrderNumber        int              `json:"orderNumber"`
	DocumentType       string           `json:"documentType"`
	CancellationReason string           `json:"cancellationReason"`
	Summary            receiptSummary   `json:"summary"`
	Metadata           *receiptMetadata `json:"metadata"`
	MainJob            *printerJob      `json:"mainJob"`
	Jobs               []printerJob     `json:"jobs"`
	UnassignedItems    []printItem      `json:"unassignedItems"`
}

type directReceiptTask struct {
	ID         string            `json:"id"`
	OrderID    string            `json:"orderId"`
	StationID  string            `json:"stationId"`
	DispatchID string            `json:"dispatchId"`
	ClaimToken string            `json:"claimToken"`
	Plan       directReceiptPlan `json:"plan"`
}

type directClaimResult struct {
	Task *directReceiptTask `json:"task"`
}

type directOutcome struct {
	ClaimToken string `json:"claimToken"`
	Outcome    string `json:"outcome"`
	ErrorCode  string `json:"errorCode,omitempty"`
}

type directAPIWorker struct {
	baseURL         string
	taskPath        string
	token           string
	stationID       string
	client          *http.Client
	agent           *agentServer
	status          *desktopStatus
	logger          *slog.Logger
	pollInterval    time.Duration
	heartbeatPeriod time.Duration
}

func newDirectAPIWorker(baseURL, token, stationID string, agent *agentServer, status *desktopStatus, logger *slog.Logger) (*directAPIWorker, error) {
	normalized, err := normalizeDirectAPIBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("не задан отдельный ключ API программы печати")
	}
	if strings.TrimSpace(stationID) == "" {
		return nil, errors.New("не найден постоянный ID программы печати")
	}
	return &directAPIWorker{
		baseURL: normalized, taskPath: "/receipt-agent/tasks", token: token, stationID: stationID,
		client: &http.Client{Timeout: 15 * time.Second}, agent: agent,
		status: status, logger: logger, pollInterval: directAPIPollInterval,
		heartbeatPeriod: directAPIHeartbeatPeriod,
	}, nil
}

func normalizeDirectAPIBaseURL(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("адрес API должен быть обычным HTTP(S) URL без логина, параметров и фрагмента")
	}
	if parsed.Scheme == "http" {
		host := parsed.Hostname()
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			return "", errors.New("удалённый API должен использовать HTTPS")
		}
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return parsed.String(), nil
}

func (worker *directAPIWorker) run(ctx context.Context) {
	for {
		if err := worker.consumeOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
			if worker.logger != nil {
				worker.logger.Warn("receipt_api_unavailable", "error", safeAPIError(err))
			}
			worker.status.apiDisconnected()
		}
		timer := time.NewTimer(worker.pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func safeAPIError(err error) string {
	if err == nil {
		return ""
	}
	// API errors are constructed only from local categories and HTTP status;
	// response bodies and the bearer credential are never logged.
	return err.Error()
}

func (worker *directAPIWorker) consumeOnce(ctx context.Context) error {
	var claim directClaimResult
	if err := worker.requestJSON(ctx, http.MethodPost, worker.taskPath+"/claim", struct{}{}, &claim); err != nil {
		return err
	}
	worker.status.apiConnected()
	if claim.Task == nil {
		return nil
	}
	task := claim.Task
	if task.StationID != worker.stationID || task.ID == "" || task.DispatchID == "" || task.ClaimToken == "" || task.OrderID != task.Plan.OrderID {
		return errors.New("API вернул задание для другой программы печати")
	}

	heartbeatContext, stopHeartbeat := context.WithCancel(ctx)
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		worker.heartbeat(heartbeatContext, task)
	}()

	payload := task.Plan.printRequest(task.DispatchID, worker.stationID)
	outcome := directOutcome{ClaimToken: task.ClaimToken}
	if len(payload.Jobs) == 0 {
		outcome.Outcome = "FAILED"
		outcome.ErrorCode = "NO_PRINTERS"
	} else if err := validatePrintRequest(payload); err != nil {
		outcome.Outcome = "FAILED"
		outcome.ErrorCode = "INVALID_PLAN"
		if worker.logger != nil {
			worker.logger.Warn("receipt_api_invalid_plan")
		}
	} else {
		printContext, cancel := context.WithTimeout(ctx, 120*time.Second)
		response, responseStatus := worker.agent.deliver(printContext, "direct-api", payload)
		cancel()
		outcome.Outcome, outcome.ErrorCode = directDeliveryOutcome(payload, response, responseStatus)
	}
	stopHeartbeat()
	<-heartbeatDone
	if err := worker.requestJSON(ctx, http.MethodPost, worker.taskPath+"/"+url.PathEscape(task.ID)+"/outcome", outcome, nil); err != nil {
		return err
	}
	worker.status.apiConnected()
	return nil
}

func (worker *directAPIWorker) heartbeat(ctx context.Context, task *directReceiptTask) {
	ticker := time.NewTicker(worker.heartbeatPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			body := struct {
				ClaimToken string `json:"claimToken"`
			}{ClaimToken: task.ClaimToken}
			if err := worker.requestJSON(ctx, http.MethodPost, worker.taskPath+"/"+url.PathEscape(task.ID)+"/heartbeat", body, nil); err != nil && worker.logger != nil {
				worker.logger.Warn("receipt_api_heartbeat_failed", "error", safeAPIError(err))
			}
		}
	}
}

func (worker *directAPIWorker) requestJSON(ctx context.Context, method, path string, input, output any) error {
	data, err := json.Marshal(input)
	if err != nil {
		return errors.New("не удалось подготовить запрос к API")
	}
	request, err := http.NewRequestWithContext(ctx, method, worker.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return errors.New("не удалось создать запрос к API")
	}
	request.Header.Set("Authorization", "Bearer "+worker.token)
	request.Header.Set("X-Receipt-Agent-Id", worker.stationID)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := worker.client.Do(request)
	if err != nil {
		return errors.New("нет связи с API")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, directAPIResponseLimit))
		return fmt.Errorf("API ответил кодом %d", response.StatusCode)
	}
	if output == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, directAPIResponseLimit))
		return nil
	}
	data, err = io.ReadAll(io.LimitReader(response.Body, directAPIResponseLimit+1))
	if err != nil || len(data) > directAPIResponseLimit {
		return errors.New("API вернул слишком большой ответ")
	}
	if err := json.Unmarshal(data, output); err != nil {
		return errors.New("API вернул неправильный ответ")
	}
	return nil
}

func (plan directReceiptPlan) printRequest(dispatchID, agentID string) printRequest {
	jobs := make([]printerJob, 0, len(plan.Jobs)+1)
	if plan.MainJob != nil {
		main := *plan.MainJob
		main.CopyType = "MAIN"
		jobs = append(jobs, main)
	}
	for _, source := range plan.Jobs {
		job := source
		job.CopyType = "KITCHEN"
		jobs = append(jobs, job)
	}
	return printRequest{
		DispatchID: dispatchID, AgentID: agentID, OrderID: plan.OrderID,
		OrderNumber: plan.OrderNumber, DocumentType: plan.DocumentType,
		CancellationReason: plan.CancellationReason, Summary: plan.Summary,
		Metadata: plan.Metadata, Jobs: jobs, UnassignedItems: plan.UnassignedItems,
	}
}

func directDeliveryOutcome(expected printRequest, response printResponse, status int) (string, string) {
	if response.AgentID != expected.AgentID || response.DispatchID != expected.DispatchID {
		return "RETRY", "AGENT_UNAVAILABLE"
	}
	if response.Uncertain {
		return "UNCERTAIN", "DELIVERY_UNCERTAIN"
	}
	if status == http.StatusOK && response.OrderID == expected.OrderID && len(response.Failed) == 0 && len(response.Printed) == len(expected.Jobs) {
		for index, source := range expected.Jobs {
			job := normalizePrinterJob(source)
			if response.Printed[index].PrinterIP != job.PrinterIP || response.Printed[index].PrinterPort != job.PrinterPort {
				return "UNCERTAIN", "DELIVERY_UNCERTAIN"
			}
		}
		return "DELIVERED", ""
	}
	if response.Retryable {
		return "RETRY", "PRINTER_UNAVAILABLE"
	}
	return "UNCERTAIN", "DELIVERY_UNCERTAIN"
}
