package main

type desktopWindow interface {
	StopRequested() <-chan struct{}
	Close()
}

type noopDesktopWindow struct {
	stop chan struct{}
}

func (window *noopDesktopWindow) StopRequested() <-chan struct{} { return window.stop }
func (window *noopDesktopWindow) Close()                         {}
