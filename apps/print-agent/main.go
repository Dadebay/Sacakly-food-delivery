package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const (
	defaultListenAddress = "127.0.0.1:17873"
	maxRequestBytes      = 1 << 20
	maxRawChunkBytes     = 330
	transportRawTCP      = "RAW_TCP"
	transportJSpeedHTTP  = "JSPEED_HTTP"
	documentTypeOrder    = "ORDER"
	documentTypeCancel   = "CANCELLATION"
)

var version = "dev"

type printItem struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unitPrice"`
}

type printerJob struct {
	PrinterIP          string           `json:"printerIp"`
	PrinterPort        int              `json:"printerPort"`
	Transport          string           `json:"transport"`
	Items              []printItem      `json:"items"`
	CopyType           string           `json:"copyType,omitempty"`
	OrderNumber        int              `json:"-"`
	DocumentType       string           `json:"-"`
	CancellationReason string           `json:"-"`
	Summary            receiptSummary   `json:"-"`
	Metadata           *receiptMetadata `json:"-"`
}

type receiptSummary struct {
	Subtotal         float64 `json:"subtotal"`
	Discount         float64 `json:"discount"`
	DeliveryFee      float64 `json:"deliveryFee"`
	Total            float64 `json:"total"`
	DeliveryAreaName string  `json:"deliveryAreaName"`
}

type printRequest struct {
	DispatchID         string           `json:"dispatchId"`
	AgentID            string           `json:"agentId,omitempty"`
	OrderID            string           `json:"orderId"`
	OrderNumber        int              `json:"orderNumber"`
	DocumentType       string           `json:"documentType"`
	CancellationReason string           `json:"cancellationReason"`
	Summary            receiptSummary   `json:"summary"`
	Metadata           *receiptMetadata `json:"metadata,omitempty"`
	Jobs               []printerJob     `json:"jobs"`
	UnassignedItems    []printItem      `json:"unassignedItems"`
}

type printedPrinter struct {
	PrinterIP   string `json:"printerIp"`
	PrinterPort int    `json:"printerPort"`
	Transport   string `json:"transport"`
	Chunks      int    `json:"chunks"`
}

type failedPrinter struct {
	PrinterIP   string `json:"printerIp"`
	PrinterPort int    `json:"printerPort"`
	Transport   string `json:"transport"`
	Message     string `json:"message"`
}

type printResponse struct {
	DispatchID     string           `json:"dispatchId"`
	AgentID        string           `json:"agentId,omitempty"`
	Retryable      bool             `json:"retryable"`
	Uncertain      bool             `json:"uncertain"`
	Replayed       bool             `json:"replayed"`
	PaperConfirmed bool             `json:"paperConfirmed"`
	OrderID        string           `json:"orderId"`
	OrderNumber    int              `json:"orderNumber"`
	Printed        []printedPrinter `json:"printed"`
	Failed         []failedPrinter  `json:"failed"`
	Message        string           `json:"message,omitempty"`
}

type jobPrinter interface {
	Print(context.Context, printerJob) (int, error)
}

type lanPrinter struct {
	mu          sync.Mutex
	dialTimeout time.Duration
	ioTimeout   time.Duration
}

type agentServer struct {
	dispatches      *dispatchStore
	desktopStatus   *desktopStatus
	dispatchGate    chan struct{}
	lastPrinterSend map[string]time.Time
	cooldown        time.Duration
	allowedOrigins  map[string]struct{}
	printer         jobPrinter
	network         *networkManager
	logger          *slog.Logger
	requestSequence atomic.Uint64
	prepareNetwork  func(context.Context, []printerJob) error
	networkLaunch   networkLaunchOptions
	browserSeen     atomic.Bool
	preflightSeen   atomic.Bool
}

func main() {
	launchDefaults, err := networkLaunchDefaults(runtime.GOOS, windowsConnectInterface, windowsConnectReserved)
	if err != nil {
		log.Fatal(err)
	}
	listenAddress := flag.String("listen", defaultListenAddress, "loopback address for the browser bridge")
	origins := flag.String(
		"origins",
		"https://a7-tagam.com.tm,http://localhost:5173,http://127.0.0.1:5173",
		"comma-separated admin origins allowed to call the agent",
	)
	showVersion := flag.Bool("version", false, "print the agent version")
	previewInput := flag.String("preview-input", "", "render a print-plan JSON without contacting printers")
	previewOutput := flag.String("preview-output", "receipt-preview.png", "PNG output for receipt preview")
	previewJob := flag.Int("preview-job", 0, "zero-based printer copy to preview")
	networkAction := flag.String("network", "", "network check, setup or rollback (then exit)")
	networkInterface := flag.String("network-interface", launchDefaults.Interface, "wired interface name; required for setup")
	networkTargets := flag.String("network-targets", "", "comma-separated printer IPv4:port endpoints for diagnostics")
	networkReserved := flag.String("network-reserved", strings.Join(launchDefaults.Reserved, ","), "private IPv4 addresses that must never be assigned to this workstation")
	connectPrinters := flag.Bool("connect-printers", launchDefaults.Enabled, "enable Windows Ethernet setup from incoming A7-tagam print plans")
	networkPrefix := flag.Int("network-prefix", 24, "confirmed printer subnet prefix, from 24 to 29")
	networkWorker := flag.String("network-worker", "", "internal elevated network operation")
	openSettings := flag.Bool("open", false, "open optional local network diagnostics")
	dispatchDirectory := flag.String("dispatch-dir", "", "persistent receipt delivery journal directory")
	apiBaseURL := flag.String("api-url", defaultAPIBaseURL, "A7-tagam API base URL")
	logDirectory := flag.String("log-dir", "", "override the per-user diagnostic log directory")
	exportLogs := flag.Bool("export-logs", false, "collect diagnostic logs into a ZIP and exit without printing")
	exportOutput := flag.String("export-output", "", "output ZIP path for -export-logs; defaults to a timestamped file")
	flag.Parse()
	if *previewInput != "" {
		if err := writeReceiptPreview(*previewInput, *previewOutput, *previewJob); err != nil {
			log.Fatal(err)
		}
		return
	}

	if *showVersion {
		fmt.Println(version)
		return
	}
	if *logDirectory == "" {
		var err error
		*logDirectory, err = defaultDiagnosticDir()
		if err != nil {
			if *exportLogs {
				log.Fatal("Не удалось определить папку журналов: ", err)
			}
			log.Print("Не удалось определить папку журналов: ", err)
			*logDirectory = ""
		}
	}
	if *exportLogs {
		if *exportOutput == "" {
			*exportOutput = "A7-tagam-logs-" + time.Now().Format("20060102-150405.000000000") + ".zip"
		}
		if err := exportDiagnostics(*logDirectory, *exportOutput); err != nil {
			log.Fatal("Не удалось собрать журналы: ", err)
		}
		path, _ := filepath.Abs(*exportOutput)
		fmt.Println("Архив журналов готов:", path)
		return
	}
	var logOutput io.Writer = os.Stderr
	logFile, err := newDiagnosticWriter(*logDirectory, diagnosticFileLimit, diagnosticFileCount)
	if err != nil {
		log.Printf("Файловый журнал недоступен: %v", err)
	} else {
		defer logFile.Close()
		logOutput = io.MultiWriter(os.Stderr, logFile)
		fmt.Fprintln(os.Stderr, "Папка журналов:", *logDirectory)
	}
	log.SetOutput(logOutput)
	diagnostics := slog.New(slog.NewJSONHandler(logOutput, nil))
	diagnostics.Info("agent_started", "version", version, "os", runtime.GOOS, "arch", runtime.GOARCH, "go", runtime.Version(), "pid", os.Getpid(), "file_logging", logFile != nil, "interfaces", diagnosticInterfaces())
	defer diagnostics.Info("agent_stopped")
	if *networkWorker != "" {
		if err := runNetworkWorker(*networkWorker); err != nil {
			log.Fatal(err)
		}
		return
	}
	manager := newNetworkManager()
	manager.targets = *networkTargets
	manager.reserved, err = parseReservedAddresses(*networkReserved)
	if err != nil {
		log.Fatal(err)
	}
	if *networkReserved == "" {
		if state, readErr := readNetworkState(networkStatePath()); readErr == nil {
			manager.reserved = state.Request.Reserved
		}
	}
	if *networkAction != "" {
		if err := manager.command(*networkAction, *networkInterface, *networkTargets, *networkPrefix); err != nil {
			log.Fatal(err)
		}
		return
	}
	host, _, err := net.SplitHostPort(*listenAddress)
	if err != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
		log.Fatal("--listen must bind to a loopback address")
	}

	handler := newAgentServer(strings.Split(*origins, ","), &lanPrinter{
		dialTimeout: 3 * time.Second,
		ioTimeout:   8 * time.Second,
	})
	statusView := newDesktopStatus(version, *listenAddress)
	directAPIToken := os.Getenv("A7_TAGAM_RECEIPT_AGENT_TOKEN")
	statusView.apiConfigured(strings.TrimSpace(directAPIToken) != "")
	handler.(*agentServer).desktopStatus = statusView
	handler.(*agentServer).network = manager
	handler.(*agentServer).logger = diagnostics
	if *connectPrinters {
		if runtime.GOOS != "windows" || *networkInterface == "" || *networkPrefix < 24 || *networkPrefix > 29 {
			log.Fatal("Для подключения аппаратов укажите Ethernet Windows и маску /24–/29")
		}
		preparer := &printerNetworkPreparer{
			iface: *networkInterface, prefix: *networkPrefix, reserved: manager.reserved,
			adapters: newSystemNetworkDriver().adapters, configure: manager.perform,
		}
		handler.(*agentServer).prepareNetwork = preparer.prepare
		handler.(*agentServer).networkLaunch = networkLaunchOptions{Enabled: true, Interface: *networkInterface, Prefix: *networkPrefix, Reserved: manager.reserved}
		log.Print("Подключение аппаратов включено. Адреса придут из A7-tagam вместе с заказом. Если нужна вторая сеть Ethernet, подтвердите запрос Windows и после сообщения «Подключение готово» повторите печать.")
	}
	server := &http.Server{
		Addr:              *listenAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      180 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	listener, err := net.Listen("tcp", *listenAddress)
	if err != nil {
		if runtime.GOOS == "windows" {
			health, healthErr := readRunningAgent(context.Background(), *listenAddress)
			if healthErr != nil {
				health = agentHealth{}
			}
			message, ready := runningAgentNotice(health, version, handler.(*agentServer).networkLaunch)
			diagnostics.Info("agent_launch_conflict", "existing_version", health.Version, "existing_network_preparation", health.NetworkPreparation.Enabled, "compatible", ready, "error", err.Error())
			log.Print(message)
			showStartupNotice(message, ready)
			if ready {
				return
			}
		}
		log.Fatal(err)
	}
	if *dispatchDirectory == "" {
		*dispatchDirectory, err = defaultDispatchDir()
		if err != nil {
			listener.Close()
			log.Fatal(err)
		}
	}
	store, err := openDispatchStore(*dispatchDirectory)
	if err != nil {
		listener.Close()
		log.Fatal("Не удалось открыть журнал отправки чеков: ", err)
	}
	defer store.Close()
	handler.(*agentServer).dispatches = store
	statusView.stationIdentified(store.agentID)
	desktop, err := startDesktopWindow(
		statusView,
		"http://"+*listenAddress+"/network",
		*logDirectory,
	)
	if err != nil {
		listener.Close()
		log.Fatal("Не удалось открыть окно программы печати: ", err)
	}
	defer desktop.Close()
	statusView.listening()
	workerDone := make(chan struct{})
	if strings.TrimSpace(directAPIToken) != "" {
		worker, workerErr := newDirectAPIWorker(*apiBaseURL, directAPIToken, store.agentID, handler.(*agentServer), statusView, diagnostics)
		if workerErr != nil {
			listener.Close()
			log.Fatal("Не удалось настроить прямую связь с API: ", workerErr)
		}
		go func() {
			defer close(workerDone)
			worker.run(shutdownContext)
		}()
		log.Print("Прямая печать через API включена. Браузер и пользовательский токен не используются.")
	} else {
		close(workerDone)
		log.Print("Прямая печать не настроена: задайте A7_TAGAM_RECEIPT_AGENT_TOKEN. Браузер для получения очереди не используется.")
	}
	go func() {
		select {
		case <-shutdownContext.Done():
			statusView.stopping()
		case <-desktop.StopRequested():
			statusView.stopping()
			stop()
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Printf("A7-tagam print agent %s listening on http://%s", version, *listenAddress)
	log.Print("Готов принимать задания из API A7-tagam. Аппараты и блюда определяются серверными настройками.")
	log.Print("Оставьте открытым только это окно. Сайт для печати не требуется.")
	diagnostics.Info("agent_listening", "agent_id", store.agentID, "direct_api", strings.TrimSpace(directAPIToken) != "", "network_preparation", *connectPrinters, "interface", *networkInterface)
	log.Printf("При необходимости — диагностика и откат: http://%s/network", *listenAddress)
	go manager.restore()
	if *openSettings {
		go openNetworkSettings("http://" + *listenAddress + "/network")
	}
	if err := server.Serve(listener); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	select {
	case <-workerDone:
	case <-time.After(15 * time.Second):
		diagnostics.Warn("receipt_api_shutdown_timeout")
	}
}

func newAgentServer(origins []string, printer jobPrinter) http.Handler {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		if normalized := strings.TrimSpace(origin); normalized != "" {
			allowed[normalized] = struct{}{}
		}
	}
	return &agentServer{allowedOrigins: allowed, printer: printer, dispatchGate: make(chan struct{}, 1), lastPrinterSend: make(map[string]time.Time), cooldown: 1500 * time.Millisecond}
}

func (server *agentServer) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if server.network != nil && strings.HasPrefix(request.URL.Path, "/network") {
		server.network.serveHTTP(writer, request)
		return
	}
	switch request.URL.Path {
	case "/health":
		if origin := request.Header.Get("Origin"); origin != "" {
			if !server.allowOrigin(writer, origin) {
				writeJSON(writer, http.StatusForbidden, map[string]string{"message": "Origin is not allowed"})
				return
			}
			if request.Method == http.MethodGet && server.logger != nil && !server.browserSeen.Swap(true) {
				server.logger.Info("browser_connected")
			}
		}
		capabilities := []string{"receipt-layout-v2"}
		agentID := ""
		if server.dispatches != nil {
			capabilities = append(capabilities, "dispatch-journal-v1")
			agentID = server.dispatches.agentID
		}
		writeJSON(writer, http.StatusOK, agentHealth{
			Application: agentApplication, Status: "ok", Version: version,
			Capabilities: capabilities, AgentID: agentID, NetworkPreparation: server.networkLaunch,
		})
	case "/v1/print":
		origin := request.Header.Get("Origin")
		if !server.allowOrigin(writer, origin) {
			if server.logger != nil {
				server.logger.Warn("print_rejected", "reason", "origin_not_allowed")
			}
			writeJSON(writer, http.StatusForbidden, map[string]string{"message": "Origin is not allowed"})
			return
		}
		if request.Method == http.MethodOptions {
			if server.logger != nil && !server.preflightSeen.Swap(true) {
				server.logger.Info("browser_print_preflight")
			}
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		if request.Method != http.MethodPost {
			if server.logger != nil {
				server.logger.Warn("print_rejected", "reason", "method_not_allowed")
			}
			writer.Header().Set("Allow", "POST, OPTIONS")
			writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"message": "Method is not allowed"})
			return
		}
		server.print(writer, request)
	default:
		writeJSON(writer, http.StatusNotFound, map[string]string{"message": "Not found"})
	}
}

func (server *agentServer) allowOrigin(writer http.ResponseWriter, origin string) bool {
	if _, ok := server.allowedOrigins[origin]; !ok || origin == "" {
		return false
	}
	writer.Header().Set("Access-Control-Allow-Origin", origin)
	writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	writer.Header().Set("Access-Control-Allow-Private-Network", "true")
	writer.Header().Set("Access-Control-Max-Age", "600")
	writer.Header().Set("Vary", "Origin")
	return true
}

func (server *agentServer) print(writer http.ResponseWriter, request *http.Request) {
	var requestLog *slog.Logger
	if server.logger != nil {
		requestLog = server.logger.With("request", fmt.Sprintf("%d-%d", os.Getpid(), server.requestSequence.Add(1)))
	}
	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var payload printRequest
	if err := decoder.Decode(&payload); err != nil {
		if requestLog != nil {
			requestLog.Warn("print_rejected", "reason", "invalid_json")
		}
		writeJSON(writer, http.StatusBadRequest, map[string]string{"message": "Invalid print request"})
		return
	}
	if err := validatePrintRequest(payload); err != nil {
		// Validation errors may interpolate caller-provided text; never log it.
		if requestLog != nil {
			requestLog.Warn("print_rejected", "reason", "invalid_parameters")
		}
		writeJSON(writer, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}
	if server.network != nil {
		server.network.observe(payload.Jobs)
	}
	ctx, cancel := context.WithTimeout(request.Context(), 120*time.Second)
	defer cancel()
	if requestLog != nil {
		requestLog = requestLog.With("order_number", payload.OrderNumber)
		requestLog.Info("print_received", "document_type", normalizeDocumentType(payload.DocumentType), "copies", len(payload.Jobs), "unassigned_items", len(payload.UnassignedItems))
	}

	response, status := server.deliver(ctx, request.Header.Get("Origin"), payload)
	writeJSON(writer, status, response)
}

func validatePrintRequest(payload printRequest) error {
	if strings.TrimSpace(payload.DispatchID) == "" || len(payload.DispatchID) > 128 || strings.TrimSpace(payload.OrderID) == "" || payload.OrderNumber < 1 {
		return errors.New("Missing order print identity")
	}
	if len(payload.Jobs) == 0 || len(payload.Jobs) > 51 {
		return errors.New("Print request must contain between 1 and 51 printer jobs")
	}
	if documentType := normalizeDocumentType(payload.DocumentType); documentType != documentTypeOrder && documentType != documentTypeCancel {
		return errors.New("Print request has an unsupported document type")
	}
	if len([]rune(payload.CancellationReason)) > 500 {
		return errors.New("Cancellation reason is too long")
	}
	if len([]rune(payload.Summary.DeliveryAreaName)) > 240 {
		return errors.New("Delivery area is too long")
	}
	if metadata := payload.Metadata; metadata != nil {
		for _, field := range []struct {
			value string
			limit int
		}{
			{metadata.BusinessPhone, 64}, {metadata.BranchName, 160},
			{metadata.CustomerName, 321}, {metadata.CustomerPhone, 64},
			{metadata.Address, 500}, {metadata.AddressDetails, 160}, {metadata.CustomerNote, 500},
		} {
			if len([]rune(field.value)) > field.limit {
				return errors.New("Receipt details are too long")
			}
		}
		if metadata.CreatedAt != "" {
			if _, err := time.Parse(time.RFC3339, metadata.CreatedAt); err != nil {
				return errors.New("Receipt date is invalid")
			}
		}
	}
	if payload.Summary.Subtotal < 0 || payload.Summary.Subtotal > 1_000_000 ||
		payload.Summary.Discount < 0 || payload.Summary.Discount > payload.Summary.Subtotal ||
		payload.Summary.DeliveryFee < 0 || payload.Summary.DeliveryFee > 1_000_000 ||
		payload.Summary.Total < 0 || payload.Summary.Total > 1_000_000 ||
		math.Abs(payload.Summary.Total-(payload.Summary.Subtotal-payload.Summary.Discount+payload.Summary.DeliveryFee)) > 0.011 {
		return errors.New("Receipt summary is invalid")
	}
	for _, job := range payload.Jobs {
		if job.CopyType != "" && job.CopyType != "MAIN" && job.CopyType != "KITCHEN" {
			return errors.New("Unsupported receipt copy type")
		}
		normalized := normalizePrinterJob(job)
		if !isPrivateIPv4(normalized.PrinterIP) {
			return fmt.Errorf("Printer %q is not a private IPv4 address", job.PrinterIP)
		}
		if normalized.PrinterPort < 1 || normalized.PrinterPort > 65535 {
			return fmt.Errorf("Printer %q has an invalid port", job.PrinterIP)
		}
		if normalized.Transport != transportRawTCP && normalized.Transport != transportJSpeedHTTP {
			return fmt.Errorf("Printer %q has an unsupported transport", job.PrinterIP)
		}
		if len(job.Items) == 0 || len(job.Items) > 50 {
			return fmt.Errorf("Printer %q must contain between 1 and 50 items", job.PrinterIP)
		}
		for _, item := range job.Items {
			if len([]rune(item.Name)) > 320 {
				return errors.New("Dish name is too long")
			}
			if strings.TrimSpace(item.ID) == "" || strings.TrimSpace(item.Name) == "" {
				return errors.New("Every print item must have an ID and name")
			}
			if item.Quantity < 1 || item.Quantity > 50 || item.UnitPrice < 0 || item.UnitPrice > 1_000_000 {
				return fmt.Errorf("Print item %q has invalid quantity or price", item.Name)
			}
		}
	}
	return nil
}

func normalizePrinterJob(job printerJob) printerJob {
	if job.Transport == "" {
		job.Transport = transportJSpeedHTTP
	}
	if job.PrinterPort == 0 {
		if job.Transport == transportRawTCP {
			job.PrinterPort = 9100
		} else {
			job.PrinterPort = 80
		}
	}
	return job
}

func normalizeDocumentType(value string) string {
	if value == "" {
		return documentTypeOrder
	}
	return value
}

func isPrivateIPv4(value string) bool {
	ip := net.ParseIP(value)
	return ip != nil && ip.To4() != nil && ip.IsPrivate()
}

func (printer *lanPrinter) Print(ctx context.Context, job printerJob) (int, error) {
	// Keep strips from simultaneous orders together, especially over J-Speed HTTP.
	printer.mu.Lock()
	defer printer.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return 0, noReceiptBytes(err)
	}
	bitmap, err := renderReceipt(job)
	if err != nil {
		return 0, noReceiptBytes(err)
	}
	packetLimit := 8 + 72*128
	if job.Transport == transportJSpeedHTTP {
		packetLimit = maxRawChunkBytes
	}
	chunks := receiptRasterPackets(bitmap, packetLimit)
	logPrintEvent(ctx, slog.LevelInfo, "receipt_rendered", "width", bitmap.Bounds().Dx(), "height", bitmap.Bounds().Dy(), "packets", len(chunks))
	if job.Transport == transportRawTCP {
		if err := printer.sendRaw(ctx, job.PrinterIP, job.PrinterPort, bytes.Join(chunks, nil)); err != nil {
			return 0, err
		}
		return 1, nil
	}
	for index, chunk := range chunks {
		var err error
		switch job.Transport {
		case transportJSpeedHTTP:
			err = printer.sendJSpeed(ctx, job.PrinterIP, job.PrinterPort, chunk)
		default:
			err = errors.New("неподдерживаемый режим подключения")
		}
		if err != nil {
			logPrintEvent(ctx, slog.LevelError, "printer_packet_failed", "packet", index+1, "packets", len(chunks), "completed_packets", index)
			if index > 0 {
				return 0, errors.New("часть чека отправлена; результат неизвестен")
			}
			return 0, fmt.Errorf("%s:%d: %w", job.PrinterIP, job.PrinterPort, err)
		}
	}
	return len(chunks), nil
}

func (printer *lanPrinter) dial(ctx context.Context, printerIP string, printerPort int) (net.Conn, error) {
	dialer := net.Dialer{Timeout: printer.dialTimeout}
	connection, err := dialer.DialContext(
		ctx,
		"tcp4",
		net.JoinHostPort(printerIP, strconv.Itoa(printerPort)),
	)
	if err != nil {
		logPrintEvent(ctx, slog.LevelError, "printer_connect_failed", "error", err.Error(), "timeout", isTimeout(err))
		return nil, noReceiptBytes(errors.New("нет соединения по LAN"))
	}
	logConnected(ctx, connection.LocalAddr().String(), connection.RemoteAddr().String())
	deadline := time.Now().Add(printer.ioTimeout)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	_ = connection.SetDeadline(deadline)
	return connection, nil
}

func (printer *lanPrinter) sendRaw(ctx context.Context, printerIP string, printerPort int, payload []byte) error {
	connection, err := printer.dial(ctx, printerIP, printerPort)
	if err != nil {
		return err
	}
	defer connection.Close()
	if sent, err := io.Copy(connection, bytes.NewReader(payload)); err != nil {
		logPrintEvent(ctx, slog.LevelError, "printer_write_failed", "error", err.Error(), "bytes_sent", sent, "bytes_total", len(payload))
		if sent == 0 {
			return noReceiptBytes(errors.New("не удалось отправить данные"))
		}
		return errors.New("не удалось отправить данные")
	}
	logPrintEvent(ctx, slog.LevelInfo, "printer_bytes_sent", "bytes", len(payload))
	if tcpConnection, ok := connection.(*net.TCPConn); ok {
		_ = tcpConnection.CloseWrite()
	}
	return nil
}

func (printer *lanPrinter) sendJSpeed(ctx context.Context, printerIP string, printerPort int, payload []byte) error {
	query := url.Values{}
	query.Set("content", spacedHex(payload))
	query.Set("hex_mode", "on")
	query.Set("Send", "Print Test")
	target := "/prt_test.htm?" + query.Encode()

	connection, err := printer.dial(ctx, printerIP, printerPort)
	if err != nil {
		return err
	}
	defer connection.Close()
	request := fmt.Sprintf("GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n", target, printerIP)
	if sent, err := io.WriteString(connection, request); err != nil {
		logPrintEvent(ctx, slog.LevelError, "printer_write_failed", "error", err.Error())
		if sent == 0 {
			return noReceiptBytes(errors.New("не удалось отправить данные"))
		}
		return errors.New("не удалось отправить данные")
	}
	if tcpConnection, ok := connection.(*net.TCPConn); ok {
		_ = tcpConnection.CloseWrite()
	}
	response, readErr := io.ReadAll(io.LimitReader(connection, 16<<10))
	if len(response) == 0 {
		if readErr != nil {
			logPrintEvent(ctx, slog.LevelError, "printer_response_failed", "error", readErr.Error())
			return errors.New("аппарат не ответил")
		}
		return errors.New("аппарат вернул пустой ответ")
	}
	if bytes.HasPrefix(response, []byte("HTTP/")) {
		fields := strings.Fields(string(response[:min(len(response), 64)]))
		if len(fields) > 1 {
			status, _ := strconv.Atoi(fields[1])
			if status < 200 || status >= 300 {
				return fmt.Errorf("аппарат вернул HTTP %d", status)
			}
		}
	}
	if !bytes.Contains(response, []byte("Print Content")) {
		return errors.New("аппарат не подтвердил задание")
	}
	return nil
}

func spacedHex(value []byte) string {
	encoded := strings.ToUpper(hex.EncodeToString(value))
	var builder strings.Builder
	builder.Grow(len(encoded) + len(value) - 1)
	for index := 0; index < len(encoded); index += 2 {
		if index > 0 {
			builder.WriteByte(' ')
		}
		builder.WriteString(encoded[index : index+2])
	}
	return builder.String()
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}
