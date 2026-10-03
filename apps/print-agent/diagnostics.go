package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const diagnosticFileLimit int64 = 2 << 20
const diagnosticFileCount = 10

// Each process owns its files, so a second launch cannot rotate an active
// Windows handle belonging to the working agent.
type diagnosticWriter struct {
	mu          sync.Mutex
	dir, prefix string
	file        *os.File
	size        int64
	part        int
	limit       int64
	keep        int
	warned      bool
}

func defaultDiagnosticDir() (string, error) {
	if runtime.GOOS == "darwin" {
		home, err := os.UserHomeDir()
		return filepath.Join(home, "Library", "Logs", "A7-tagam Print Agent"), err
	}
	cache, err := os.UserCacheDir()
	return filepath.Join(cache, "A7-tagam", "PrintAgent", "logs"), err
}

func newDiagnosticWriter(dir string, limit int64, keep int) (*diagnosticWriter, error) {
	if limit < 1 || keep < 1 {
		return nil, errors.New("invalid log retention")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	w := &diagnosticWriter{dir: dir, prefix: fmt.Sprintf("print-agent-%s-%d", time.Now().UTC().Format("20060102T150405.000000000Z"), os.Getpid()), limit: limit, keep: keep}
	if err := w.rotate(); err != nil {
		return nil, err
	}
	return w, nil
}

func diagnosticFiles(dir string) ([]os.DirEntry, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var files []os.DirEntry
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "print-agent-") && strings.HasSuffix(entry.Name(), ".log") && entry.Type().IsRegular() {
			files = append(files, entry)
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name() > files[j].Name() })
	return files, nil
}

func (w *diagnosticWriter) rotate() error {
	if w.file != nil {
		_ = w.file.Close()
		w.file = nil
	}
	w.part++
	file, err := os.OpenFile(filepath.Join(w.dir, fmt.Sprintf("%s-%05d.log", w.prefix, w.part)), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	w.file, w.size = file, 0
	files, err := diagnosticFiles(w.dir)
	if err == nil {
		for _, entry := range files[min(w.keep, len(files)):] {
			// Active files from another process may be locked on Windows.
			if filepath.Join(w.dir, entry.Name()) != file.Name() {
				_ = os.Remove(filepath.Join(w.dir, entry.Name()))
			}
		}
	}
	return nil
}

func (w *diagnosticWriter) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	length := len(data)
	if int64(length) > w.limit {
		data = []byte("log_record_omitted: record exceeds size limit\n")
	}
	var err error
	if w.file == nil || w.size+int64(len(data)) > w.limit {
		err = w.rotate()
	}
	if err == nil {
		var n int
		n, err = w.file.Write(data)
		w.size += int64(n)
	}
	if err != nil && !w.warned {
		fmt.Fprintln(os.Stderr, "Не удалось записать журнал печати:", err)
		w.warned = true
	}
	// A full disk or locked log file must never cancel a receipt.
	return length, nil
}

func (w *diagnosticWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

type printLogContextKey struct{}
type printLogContext struct {
	logger    *slog.Logger
	connected sync.Once
}

func logPrintEvent(ctx context.Context, level slog.Level, event string, args ...any) {
	if trace, ok := ctx.Value(printLogContextKey{}).(*printLogContext); ok && trace.logger != nil {
		trace.logger.Log(ctx, level, event, args...)
	}
}

func logConnected(ctx context.Context, localAddress, target string) {
	if trace, ok := ctx.Value(printLogContextKey{}).(*printLogContext); ok {
		trace.connected.Do(func() {
			logPrintEvent(ctx, slog.LevelInfo, "printer_connected", "local_address", localAddress, "target", target)
		})
	}
}

func isTimeout(err error) bool {
	var networkError net.Error
	return errors.As(err, &networkError) && networkError.Timeout()
}

// Addresses are sufficient to diagnose the two printer subnets. Do not collect
// MACs, host/user names, environment variables, Wi-Fi SSIDs or auth material.
func diagnosticInterfaces() []map[string]any {
	result := make([]map[string]any, 0)
	interfaces, err := net.Interfaces()
	if err != nil {
		return result
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addresses, _ := iface.Addrs()
		var ipv4 []string
		for _, address := range addresses {
			ip, _, err := net.ParseCIDR(address.String())
			if err == nil && ip.To4() != nil && ip.IsPrivate() {
				ipv4 = append(ipv4, address.String())
			}
		}
		if len(ipv4) > 0 {
			result = append(result, map[string]any{"index": iface.Index, "up": iface.Flags&net.FlagUp != 0, "ipv4": ipv4})
		}
	}
	return result
}

func exportDiagnostics(dir, output string) (resultErr error) {
	files, err := diagnosticFiles(dir)
	if err != nil {
		return err
	}
	outputFile, err := os.OpenFile(output, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer func() {
		if err := outputFile.Close(); resultErr == nil {
			resultErr = err
		}
		if resultErr != nil {
			_ = os.Remove(output)
		}
	}()
	archive := zip.NewWriter(outputFile)
	for _, entry := range files[:min(diagnosticFileCount, len(files))] {
		path := filepath.Join(dir, entry.Name())
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			continue
		} // Another process may have just rotated it.
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			continue
		}
		input, err := os.Open(path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		part, err := archive.Create("logs/" + entry.Name())
		if err == nil {
			_, err = io.Copy(part, io.LimitReader(input, diagnosticFileLimit))
		}
		_ = input.Close()
		if err != nil {
			return err
		}
	}
	part, err := archive.Create("diagnostics.json")
	if err != nil {
		return err
	}
	if err = json.NewEncoder(part).Encode(map[string]any{"version": version, "os": runtime.GOOS, "arch": runtime.GOARCH, "go": runtime.Version(), "collected_at": time.Now().Format(time.RFC3339), "interfaces": diagnosticInterfaces()}); err != nil {
		return err
	}
	part, err = archive.Create("README.txt")
	if err != nil {
		return err
	}
	_, err = io.WriteString(part, "A7-tagam print diagnostics\nprinter_sent means bytes were transmitted, not that paper output was confirmed.\nIf no print_received event exists for an order, its request did not reach this agent.\nMAIN/KITCHEN is present only when the website supplies copyType; UNSPECIFIED is a legacy website request.\nThe archive contains technical logs and private LAN addresses. It excludes receipt text, customer contacts, prices and authentication data.\n")
	if err != nil {
		return err
	}
	return archive.Close()
}
