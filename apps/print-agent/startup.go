package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"slices"
	"time"
)

// A workstation-specific release may opt in locally at build time. No browser
// request can enable preparation or supply these workstation settings.
var windowsConnectInterface string
var windowsConnectReserved string

type networkLaunchOptions struct {
	Enabled   bool     `json:"enabled"`
	Interface string   `json:"interface,omitempty"`
	Prefix    int      `json:"prefix,omitempty"`
	Reserved  []string `json:"reserved,omitempty"`
}

func networkLaunchDefaults(goos, iface, reserved string) (networkLaunchOptions, error) {
	if goos != "windows" || iface == "" {
		return networkLaunchOptions{}, nil
	}
	addresses, err := parseReservedAddresses(reserved)
	if err != nil {
		return networkLaunchOptions{}, err
	}
	return networkLaunchOptions{Enabled: true, Interface: iface, Prefix: 24, Reserved: addresses}, nil
}

const agentApplication = "A7-tagam Print Agent"

type agentHealth struct {
	AgentID            string               `json:"agentId,omitempty"`
	Application        string               `json:"application"`
	Status             string               `json:"status"`
	Version            string               `json:"version"`
	Capabilities       []string             `json:"capabilities"`
	NetworkPreparation networkLaunchOptions `json:"networkPreparation"`
}

func readRunningAgent(ctx context.Context, address string) (agentHealth, error) {
	var health agentHealth
	host, _, err := net.SplitHostPort(address)
	if err != nil || (host != "127.0.0.1" && host != "::1" && host != "localhost") {
		return health, errors.New("agent status requires a loopback address")
	}
	client := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			Proxy: nil, DisableKeepAlives: true,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+address+"/health", nil)
	if err != nil {
		return health, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return health, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return health, errors.New("agent status is unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8193))
	if err != nil || len(data) > 8192 {
		return health, errors.New("invalid agent status size")
	}
	if err = json.Unmarshal(data, &health); err != nil {
		return health, err
	}
	return health, nil
}

func runningAgentNotice(health agentHealth, expectedVersion string, wanted networkLaunchOptions) (string, bool) {
	if health.Application != agentApplication || health.Status != "ok" {
		return "Не удалось запустить печать: локальный адрес уже занят. Закройте ранее открытые окна A7-tagam Print и запустите A7-tagam-Print.exe один раз.", false
	}
	current := health.NetworkPreparation
	matching := current.Enabled == wanted.Enabled && (!wanted.Enabled ||
		(current.Interface == wanted.Interface && current.Prefix == wanted.Prefix && slices.Equal(current.Reserved, wanted.Reserved)))
	if health.Version != expectedVersion || !matching {
		return "Уже открыта другая версия или режим A7-tagam Print. Закройте прежнее окно программы и снова запустите этот A7-tagam-Print.exe. Новая версия пока не запущена.", false
	}
	return "A7-tagam Print уже работает. Оставьте первое окно программы открытым. Сайт для печати не требуется.", true
}
