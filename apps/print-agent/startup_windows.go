//go:build windows

package main

import (
	"log"
	"syscall"
	"unsafe"
)

func showStartupNotice(message string, ready bool) {
	title, _ := syscall.UTF16PtrFromString(agentApplication)
	body, err := syscall.UTF16PtrFromString(message)
	if err != nil {
		return
	}
	style := uintptr(0x30) // MB_OK | MB_ICONWARNING
	if ready {
		style = 0x40 // MB_OK | MB_ICONINFORMATION
	}
	result, _, callErr := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(
		0, uintptr(unsafe.Pointer(body)), uintptr(unsafe.Pointer(title)), style,
	)
	if result == 0 {
		log.Printf("Не удалось показать сообщение запуска: %v", callErr)
	}
}
