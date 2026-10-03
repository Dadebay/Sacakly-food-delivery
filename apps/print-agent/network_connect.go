package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// This hook is installed only by local launch options (including packaged defaults).
// Browser requests cannot enable it or choose an interface, mask or exclusions.
type printerNetworkPreparer struct {
	mu        sync.Mutex
	iface     string
	prefix    int
	reserved  []string
	adapters  func(context.Context) ([]networkAdapter, error)
	configure func(networkRequest) error
	pending   *printerNetworkTask
}

var errPrinterNetworkPreparing = errors.New("Подключение аппаратов настраивается. Подтвердите запрос Windows, дождитесь сообщения «Подключение готово» в программе. Очередь повторит отправку автоматически. Этот чек ещё не отправлен.")

type printerNetworkTask struct {
	done chan struct{}
	err  error
}

func printerNetworkRequest(adapters []networkAdapter, iface string, prefix int, reserved []string, jobs []printerJob) (*networkRequest, error) {
	a, err := findAdapter(adapters, iface, "")
	if err != nil {
		return nil, err
	}
	var endpoints []string
	missing := false
	for _, raw := range jobs {
		job := normalizePrinterJob(raw)
		target := net.JoinHostPort(job.PrinterIP, strconv.Itoa(job.PrinterPort))
		endpoints = append(endpoints, target)
		if localSource(a, target) == nil {
			missing = true
		}
	}
	targets, err := parseNetworkTargets(strings.Join(endpoints, ","))
	if err != nil {
		return nil, err
	}
	if !missing {
		return nil, nil // Existing access needs no mutation or elevation.
	}
	if err := safeNetworkAdapter(a); err != nil {
		return nil, err
	}
	req := &networkRequest{Action: "setup", Interface: a.Name, MAC: a.MAC, Prefix: prefix, Targets: targets, Reserved: slices.Clone(reserved)}
	if err := validateNetworkRequest(*req); err != nil {
		return nil, err
	}
	return req, nil
}

func (p *printerNetworkPreparer) prepare(ctx context.Context, jobs []printerJob) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	if p.pending != nil {
		select {
		case <-p.pending.done:
			err := p.pending.err
			p.pending = nil
			if err != nil {
				return fmt.Errorf("подключение аппаратов: %w", err)
			}
		default:
			return errPrinterNetworkPreparing
		}
	}
	// Legacy deployed A7-tagam clients have an eight-second HTTP timeout.
	// Keep discovery bounded and never hold a receipt open across Windows UAC.
	readCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	adapters, err := p.adapters(readCtx)
	if err != nil {
		return err
	}
	req, err := printerNetworkRequest(adapters, p.iface, p.prefix, p.reserved, jobs)
	if err != nil || req == nil {
		return err
	}
	log.Printf("Подключаю аппараты из задания A7-tagam: %s. Ожидается подтверждение Windows.", strings.Join(req.Targets, ", "))
	task := &printerNetworkTask{done: make(chan struct{})}
	p.pending = task
	go func() {
		task.err = p.configure(*req)
		if task.err != nil {
			log.Printf("Подключить аппараты не удалось: %v. Данные чека не отправлялись.", task.err)
		} else {
			log.Print("Подключение готово. Очередь A7-tagam повторит отправку автоматически. Адреса аппаратов вводить не нужно.")
		}
		close(task.done)
	}()
	// This request never prints, including if setup finishes immediately. A
	// deliberate retry avoids late/duplicate receipts after the site's timeout.
	return errPrinterNetworkPreparing
}
