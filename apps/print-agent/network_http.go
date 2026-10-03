package main

import (
	"context"
	"crypto/subtle"
	_ "embed"
	"encoding/json"
	"html/template"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

//go:embed network.html
var networkHTML string

type networkCheck struct {
	Target       string `json:"target"`
	Reachable    bool   `json:"reachable"`
	LocalAddress string `json:"localAddress"`
	Message      string `json:"message"`
}

type networkReport struct {
	Adapters   []networkAdapter `json:"adapters"`
	Checks     []networkCheck   `json:"checks"`
	State      *networkState    `json:"state,omitempty"`
	StateError string           `json:"stateError,omitempty"`
}

func (manager *networkManager) observe(jobs []printerJob) {
	var targets []string
	for _, job := range jobs {
		normalized := normalizePrinterJob(job)
		targets = append(targets, net.JoinHostPort(normalized.PrinterIP, strconv.Itoa(normalized.PrinterPort)))
	}
	manager.mu.Lock()
	manager.targets = strings.Join(targets, ",")
	manager.mu.Unlock()
}

func (manager *networkManager) diagnose(ctx context.Context, targets string) (*networkReport, error) {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	adapters, err := newSystemNetworkDriver().adapters(ctx)
	if err != nil {
		return nil, err
	}
	report := &networkReport{Adapters: adapters, Checks: []networkCheck{}}
	if state, err := readNetworkState(networkStatePath()); err == nil {
		report.State = state
	} else if !os.IsNotExist(err) {
		report.StateError = err.Error()
	}
	if strings.TrimSpace(targets) == "" {
		return report, nil
	}
	parsed, err := parseNetworkTargets(targets)
	if err != nil {
		return nil, err
	}
	results := make(chan networkCheck, len(parsed))
	for _, target := range parsed {
		go func() {
			check := networkCheck{Target: target}
			d := net.Dialer{Timeout: 2 * time.Second}
			c, err := d.DialContext(ctx, "tcp4", target)
			if err != nil {
				check.Message = "Нет соединения с портом аппарата"
			} else {
				check.Reachable = true
				check.LocalAddress = c.LocalAddr().String()
				check.Message = "Порт доступен; данные на печать не отправлялись"
				_ = c.Close()
			}
			results <- check
		}()
	}
	for range parsed {
		report.Checks = append(report.Checks, <-results)
	}
	return report, nil
}

func localNetworkRequest(req *http.Request) bool {
	host, _, err := net.SplitHostPort(req.Host)
	if err != nil {
		return false
	}
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		return false
	}
	remote, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil || net.ParseIP(remote) == nil || !net.ParseIP(remote).IsLoopback() {
		return false
	}
	if origin := req.Header.Get("Origin"); origin != "" {
		u, err := url.Parse(origin)
		if err != nil || u.Scheme != "http" || u.Host != req.Host {
			return false
		}
	}
	return true
}

func (manager *networkManager) serveHTTP(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+manager.token+"'; style-src 'nonce-"+manager.token+"'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
	if !localNetworkRequest(req) {
		http.Error(w, "Настройки доступны только на этом компьютере", http.StatusForbidden)
		return
	}
	if req.URL.Path == "/network" && req.Method == http.MethodGet {
		manager.mu.Lock()
		targets := manager.targets
		manager.mu.Unlock()
		if targets == "" {
			if state, err := readNetworkState(networkStatePath()); err == nil {
				targets = strings.Join(state.Request.Targets, "\n")
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = template.Must(template.New("network").Parse(networkHTML)).Execute(w, struct{ Token, Targets, Version string }{manager.token, targets, version})
		return
	}
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if subtle.ConstantTimeCompare([]byte(req.Header.Get("X-Network-Token")), []byte(manager.token)) != 1 {
		http.Error(w, "Откройте настройки заново", http.StatusForbidden)
		return
	}
	var input struct {
		Interface string `json:"interface"`
		MAC       string `json:"mac"`
		Targets   string `json:"targets"`
		Prefix    int    `json:"prefix"`
	}
	req.Body = http.MaxBytesReader(w, req.Body, 16384)
	decoder := json.NewDecoder(req.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(w, "Неверный запрос", http.StatusBadRequest)
		return
	}
	if req.URL.Path == "/network/check" {
		report, err := manager.diagnose(req.Context(), input.Targets)
		if err != nil {
			log.Printf("Проверка сети не выполнена: %v", err)
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, report)
		return
	}
	request := networkRequest{Action: "rollback"}
	if req.URL.Path == "/network/setup" {
		targets, err := parseNetworkTargets(input.Targets)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
			return
		}
		request = networkRequest{Action: "setup", Interface: input.Interface, MAC: input.MAC, Targets: targets, Prefix: input.Prefix, Reserved: manager.reserved}
	} else if req.URL.Path != "/network/rollback" {
		http.NotFound(w, req)
		return
	}
	if err := manager.perform(request); err != nil {
		message := err.Error()
		if state, e := readNetworkState(networkStatePath()); e == nil && time.Since(state.Updated) < 2*time.Minute && state.Status != "active" {
			message += ". " + state.Message
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": message})
		return
	}
	state, err := readNetworkState(networkStatePath())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"message": "Сохранённых изменений нет"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": state.Message})
}
