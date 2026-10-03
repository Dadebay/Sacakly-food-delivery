package main

import (
	"golang.org/x/sys/windows"
	"os"
)

func lockDispatchFile(file *os.File) error {
	return windows.LockFileEx(windows.Handle(file.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &windows.Overlapped{})
}

// File.Sync uses FlushFileBuffers on Windows. Directory handles cannot be
// flushed portably; keep journals append-only and never replace existing files.
func syncDispatchDir(string) error { return nil }
