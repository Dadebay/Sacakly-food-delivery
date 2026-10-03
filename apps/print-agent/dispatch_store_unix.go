//go:build !windows

package main

import (
	"golang.org/x/sys/unix"
	"os"
)

func lockDispatchFile(file *os.File) error {
	return unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB)
}
func syncDispatchDir(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
