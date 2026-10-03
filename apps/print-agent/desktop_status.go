package main

import (
	"fmt"
	"net"
	"sync"
	"time"
)

type desktopStatusSnapshot struct {
	Version        string
	ListenAddress  string
	StationID      string
	Phase          string
	APIConfigured  bool
	APILastSeen    time.Time
	APIUnavailable bool
	CurrentOrder   int
	DocumentType   string
	CopyIndex      int
	CopyCount      int
	PrinterTarget  string
	SentCopies     uint64
	FailedCopies   uint64
	LastMessage    string
	UpdatedAt      time.Time
}

// desktopStatus is the privacy-bounded, thread-safe state rendered by the
// Windows operator window. It intentionally contains no customer, address,
// item, price, comment, auth or dispatch-journal content.
type desktopStatus struct {
	mu       sync.RWMutex
	snapshot desktopStatusSnapshot
}

func newDesktopStatus(agentVersion, listenAddress string) *desktopStatus {
	return &desktopStatus{snapshot: desktopStatusSnapshot{
		Version:       agentVersion,
		ListenAddress: listenAddress,
		Phase:         "STARTING",
		LastMessage:   "Программа запускается…",
		UpdatedAt:     time.Now(),
	}}
}

func (status *desktopStatus) update(change func(*desktopStatusSnapshot)) {
	if status == nil {
		return
	}
	status.mu.Lock()
	defer status.mu.Unlock()
	change(&status.snapshot)
	status.snapshot.UpdatedAt = time.Now()
}

func (status *desktopStatus) snapshotValue() desktopStatusSnapshot {
	if status == nil {
		return desktopStatusSnapshot{}
	}
	status.mu.RLock()
	defer status.mu.RUnlock()
	return status.snapshot
}

func (status *desktopStatus) listening() {
	status.update(func(snapshot *desktopStatusSnapshot) {
		if snapshot.APIConfigured {
			snapshot.Phase = "READY"
			snapshot.LastMessage = "Печать работает. Подключаемся к API A7-tagam…"
		} else {
			snapshot.Phase = "ATTENTION"
			snapshot.LastMessage = "Не задан отдельный API-ключ программы печати. Браузер для печати не используется."
		}
	})
}

func (status *desktopStatus) apiConfigured(configured bool) {
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.APIConfigured = configured
	})
}

func (status *desktopStatus) stationIdentified(stationID string) {
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.StationID = stationID
	})
}

func (status *desktopStatus) apiConnected() {
	status.update(func(snapshot *desktopStatusSnapshot) {
		wasUnavailable := snapshot.APIUnavailable
		snapshot.APILastSeen = time.Now()
		snapshot.APIUnavailable = false
		if snapshot.Phase == "READY" || (wasUnavailable && snapshot.Phase == "RETRYING") {
			snapshot.Phase = "READY"
			snapshot.LastMessage = "API A7-tagam подключён. EXE сама проверяет очередь чеков."
		}
	})
}

func (status *desktopStatus) apiDisconnected() {
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.APIUnavailable = true
		if snapshot.Phase == "READY" || snapshot.Phase == "RETRYING" {
			snapshot.Phase = "RETRYING"
			snapshot.LastMessage = "Нет связи с API A7-tagam. Очередь сохранена на сервере; повторяем автоматически."
		}
	})
}

func (status *desktopStatus) dispatchReceived(orderNumber int, documentType string, copies int) {
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.Phase = "PRINTING"
		snapshot.CurrentOrder = orderNumber
		snapshot.DocumentType = normalizeDocumentType(documentType)
		snapshot.CopyIndex = 0
		snapshot.CopyCount = copies
		snapshot.PrinterTarget = ""
		snapshot.LastMessage = fmt.Sprintf("Получено задание для заказа №%d.", orderNumber)
	})
}

func (status *desktopStatus) copyStarted(orderNumber int, documentType string, copyIndex, copyCount int, job printerJob) {
	target := net.JoinHostPort(job.PrinterIP, fmt.Sprintf("%d", job.PrinterPort))
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.Phase = "PRINTING"
		snapshot.CurrentOrder = orderNumber
		snapshot.DocumentType = normalizeDocumentType(documentType)
		snapshot.CopyIndex = copyIndex
		snapshot.CopyCount = copyCount
		snapshot.PrinterTarget = target
		snapshot.LastMessage = fmt.Sprintf("Передаём копию %d из %d аппарату %s.", copyIndex, copyCount, target)
	})
}

func (status *desktopStatus) copyReplayed(orderNumber, copyIndex, copyCount int, job printerJob) {
	target := net.JoinHostPort(job.PrinterIP, fmt.Sprintf("%d", job.PrinterPort))
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.Phase = "PRINTING"
		snapshot.CurrentOrder = orderNumber
		snapshot.CopyIndex = copyIndex
		snapshot.CopyCount = copyCount
		snapshot.PrinterTarget = target
		snapshot.LastMessage = fmt.Sprintf("Копия %d из %d уже была передана; повтор не выполнялся.", copyIndex, copyCount)
	})
}

func (status *desktopStatus) copySucceeded(orderNumber, copyIndex, copyCount int, job printerJob) {
	target := net.JoinHostPort(job.PrinterIP, fmt.Sprintf("%d", job.PrinterPort))
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.SentCopies++
		snapshot.LastMessage = fmt.Sprintf("Заказ №%d: копия %d из %d передана аппарату %s. Бумага программой не подтверждается.", orderNumber, copyIndex, copyCount, target)
	})
}

func (status *desktopStatus) copyFailed(orderNumber, copyIndex, copyCount int, job printerJob) {
	target := net.JoinHostPort(job.PrinterIP, fmt.Sprintf("%d", job.PrinterPort))
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.FailedCopies++
		snapshot.LastMessage = fmt.Sprintf("Заказ №%d: аппарат %s не принял копию %d из %d. Очередь сохранит безопасный повтор.", orderNumber, target, copyIndex, copyCount)
	})
}

func (status *desktopStatus) dispatchCompleted(orderNumber, sent, failed int, uncertain bool) {
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.CurrentOrder = 0
		snapshot.DocumentType = ""
		snapshot.CopyIndex = 0
		snapshot.CopyCount = 0
		snapshot.PrinterTarget = ""
		switch {
		case uncertain:
			snapshot.Phase = "ATTENTION"
			snapshot.LastMessage = fmt.Sprintf("Заказ №%d: результат неизвестен. Проверьте бумагу; автоматический повтор остановлен.", orderNumber)
		case failed > 0:
			snapshot.Phase = "RETRYING"
			snapshot.LastMessage = fmt.Sprintf("Заказ №%d: передано %d, ошибок %d. Неотправленные копии останутся в очереди.", orderNumber, sent, failed)
		default:
			snapshot.Phase = "READY"
			snapshot.LastMessage = fmt.Sprintf("Заказ №%d: аппарату передано копий — %d. Бумага программой не подтверждается.", orderNumber, sent)
		}
	})
}

func (status *desktopStatus) stopping() {
	status.update(func(snapshot *desktopStatusSnapshot) {
		snapshot.Phase = "STOPPING"
		snapshot.LastMessage = "Останавливаем программу печати…"
	})
}

func allowDesktopShutdown(explicitStop, confirmed bool) bool {
	return explicitStop && confirmed
}
