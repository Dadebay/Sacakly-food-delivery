//go:build !windows

package main

func startDesktopWindow(*desktopStatus, string, string) (desktopWindow, error) {
	return &noopDesktopWindow{stop: make(chan struct{})}, nil
}
