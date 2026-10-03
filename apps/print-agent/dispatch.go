package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"time"
)

type noReceiptBytesError struct{ error }

func (e noReceiptBytesError) Unwrap() error { return e.error }
func noReceiptBytes(err error) error        { return noReceiptBytesError{err} }
func safeToRetry(err error) bool            { var safe noReceiptBytesError; return errors.As(err, &safe) }

// One dispatch owns all its copies. Callers cancelled while waiting never print;
// accepted dispatches finish independently of a lost browser HTTP connection.
func (s *agentServer) deliver(ctx context.Context, origin string, p printRequest) (printResponse, int) {
	r := printResponse{OrderID: p.OrderID, OrderNumber: p.OrderNumber, DispatchID: p.DispatchID, Printed: []printedPrinter{}, Failed: []failedPrinter{}}
	defer func() {
		if s.logger != nil {
			s.logger.Info("print_completed", "order_number", p.OrderNumber, "sent", len(r.Printed), "failed", len(r.Failed), "replayed", r.Replayed, "uncertain", r.Uncertain, "paper_confirmed", false)
		}
	}()
	select {
	case s.dispatchGate <- struct{}{}:
		defer func() { <-s.dispatchGate }()
	case <-ctx.Done():
		r.Message = "Задание не принято: ожидание прервано"
		r.Retryable = true
		return r, http.StatusServiceUnavailable
	}
	if ctx.Err() != nil {
		r.Retryable = true
		return r, http.StatusServiceUnavailable
	}
	if s.desktopStatus != nil {
		s.desktopStatus.dispatchReceived(p.OrderNumber, p.DocumentType, len(p.Jobs))
		defer func() {
			s.desktopStatus.dispatchCompleted(p.OrderNumber, len(r.Printed), len(r.Failed), r.Uncertain)
		}()
	}
	var journal *dispatchJournal
	if s.dispatches != nil {
		r.AgentID = s.dispatches.agentID
		if p.AgentID != "" && p.AgentID != r.AgentID {
			r.Retryable = true
			r.Message = "Задание принадлежит другой установке программы. Печать не начиналась."
			return r, http.StatusConflict
		}
		var err error
		journal, err = s.dispatches.open(origin, p)
		if err != nil {
			r.Message = "Журнал печати недоступен. Проверьте чек перед повтором."
			r.Uncertain = true
			if errors.Is(err, errDispatchConflict) {
				r.Message = err.Error()
				return r, http.StatusConflict
			}
			return r, http.StatusServiceUnavailable
		}
		defer journal.file.Close()
		r.AgentID = s.dispatches.agentID
		for _, state := range journal.states {
			if state.State == "started" {
				r.Uncertain = true
				r.Message = "Отправка была прервана. Проверьте бумагу; автоматический повтор остановлен."
				return r, http.StatusConflict
			}
		}
	}
	work, cancel := context.WithTimeout(context.WithoutCancel(ctx), 120*time.Second)
	defer cancel()
	jobs := make([]printerJob, 0, len(p.Jobs))
	for i, j := range p.Jobs {
		if journal == nil || journal.states[i].State != "sent" {
			jobs = append(jobs, j)
		}
	}
	if len(jobs) > 0 && s.prepareNetwork != nil {
		err := s.prepareNetwork(ctx, jobs)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			r.Retryable = true
			r.Message = "Не удалось подключить аппараты. Новые копии не отправлялись."
			for _, job := range jobs {
				r.Failed = append(r.Failed, failedPrinter{PrinterIP: job.PrinterIP, PrinterPort: job.PrinterPort, Transport: job.Transport, Message: r.Message})
			}
			if s.logger != nil {
				s.logger.Error("network_preparation_failed", "order_number", p.OrderNumber, "error", err.Error())
			}
			return r, http.StatusBadGateway
		}
	}
	for i, raw := range p.Jobs {
		job := normalizePrinterJob(raw)
		job.OrderNumber = p.OrderNumber
		job.DocumentType = normalizeDocumentType(p.DocumentType)
		job.CancellationReason = p.CancellationReason
		job.Summary = p.Summary
		job.Metadata = p.Metadata
		if journal != nil && journal.states[i].State == "sent" {
			r.Replayed = true
			r.Printed = append(r.Printed, printedPrinter{PrinterIP: job.PrinterIP, PrinterPort: job.PrinterPort, Transport: job.Transport, Chunks: journal.states[i].Chunks})
			if s.desktopStatus != nil {
				s.desktopStatus.copyReplayed(p.OrderNumber, i+1, len(p.Jobs), job)
			}
			continue
		}
		// The cooldown also spans separate orders, not only adjacent copies.
		key := net.JoinHostPort(job.PrinterIP, strconv.Itoa(job.PrinterPort))
		if job.Transport == transportRawTCP {
			wait := time.Until(s.lastPrinterSend[key].Add(s.cooldown))
			if wait > 0 {
				timer := time.NewTimer(wait)
				select {
				case <-timer.C:
				case <-work.Done():
					timer.Stop()
				}
			}
		}
		if err := work.Err(); err != nil {
			r.Retryable = true
			r.Message = "Не все копии успели отправиться; повтор продолжит задание."
			return r, http.StatusServiceUnavailable
		}
		if journal != nil {
			if err := journal.append(dispatchRecord{Copy: i, State: "started"}); err != nil {
				r.Uncertain = true
				r.Message = "Не удалось сохранить начало отправки; печать остановлена."
				return r, http.StatusServiceUnavailable
			}
		}
		copyContext := work
		if s.logger != nil {
			copyContext = context.WithValue(work, printLogContextKey{}, &printLogContext{logger: s.logger.With("order_number", p.OrderNumber, "copy", i+1, "copy_type", job.CopyType, "target", key, "transport", job.Transport)})
		}
		if s.logger != nil {
			copyContext.Value(printLogContextKey{}).(*printLogContext).logger.Info("printer_started")
		}
		if s.desktopStatus != nil {
			s.desktopStatus.copyStarted(p.OrderNumber, p.DocumentType, i+1, len(p.Jobs), job)
		}
		chunks, err := s.printer.Print(copyContext, job)
		s.lastPrinterSend[key] = time.Now()
		state := "sent"
		if err != nil {
			if s.logger != nil {
				copyContext.Value(printLogContextKey{}).(*printLogContext).logger.Error("printer_failed", "error", err.Error(), "paper_confirmed", false)
			}
			state = "started"
			if safeToRetry(err) {
				state = "retryable"
			}
		}
		if journal != nil && state != "started" {
			if saveErr := journal.append(dispatchRecord{Copy: i, State: state, Chunks: chunks}); saveErr != nil {
				r.Uncertain = true
				r.Message = "Результат не сохранён. Проверьте чек; повтор остановлен."
				return r, http.StatusServiceUnavailable
			}
		}
		if err != nil {
			if s.desktopStatus != nil {
				s.desktopStatus.copyFailed(p.OrderNumber, i+1, len(p.Jobs), job)
			}
			r.Failed = append(r.Failed, failedPrinter{PrinterIP: job.PrinterIP, PrinterPort: job.PrinterPort, Transport: job.Transport, Message: err.Error()})
			if !safeToRetry(err) {
				r.Uncertain = true
				r.Message = "Результат отправки неизвестен. Проверьте бумагу перед ручной повторной печатью."
				return r, http.StatusBadGateway
			}
			r.Retryable = true
		} else {
			if s.desktopStatus != nil {
				s.desktopStatus.copySucceeded(p.OrderNumber, i+1, len(p.Jobs), job)
			}
			if s.logger != nil {
				copyContext.Value(printLogContextKey{}).(*printLogContext).logger.Info("printer_sent", "chunks", chunks, "paper_confirmed", false)
			}
			r.Printed = append(r.Printed, printedPrinter{PrinterIP: job.PrinterIP, PrinterPort: job.PrinterPort, Transport: job.Transport, Chunks: chunks})
		}
	}
	if len(r.Failed) > 0 {
		r.Message = "Не все аппараты доступны; повторятся только неотправленные копии."
		return r, http.StatusBadGateway
	}
	return r, http.StatusOK
}
