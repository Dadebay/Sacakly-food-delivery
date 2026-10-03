//go:build windows

package main

import (
	"errors"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	winWSOverlapped  = 0x00000000
	winWSCaption     = 0x00C00000
	winWSSysMenu     = 0x00080000
	winWSMinimizeBox = 0x00020000
	winWSChild       = 0x40000000
	winWSVisible     = 0x10000000
	winWSBorder      = 0x00800000

	winCWUseDefault = ^uintptr(0x7fffffff)
	winSWShow       = 5
	winSWHide       = 0

	winWMClose   = 0x0010
	winWMDestroy = 0x0002
	winWMCommand = 0x0111
	winWMTimer   = 0x0113
	winWMSetFont = 0x0030
	winWMApp     = 0x8000

	winMBOK          = 0x00000000
	winMBYesNo       = 0x00000004
	winMBIconInfo    = 0x00000040
	winMBIconWarning = 0x00000030
	winMBDefButton2  = 0x00000100
	winIDYes         = 6

	winDefaultGUIFont    = 17
	winEnableQuickEdit   = 0x0040
	winExtendedFlags     = 0x0080
	winStdInputHandle    = ^uintptr(9)
	winButtonDiagnostics = 1002
	winButtonLogs        = 1003
	winButtonStop        = 1004
	winStatusTimer       = 1
	winCloseMessage      = winWMApp + 1
)

var (
	winUser32                = syscall.NewLazyDLL("user32.dll")
	winKernel32              = syscall.NewLazyDLL("kernel32.dll")
	winGDI32                 = syscall.NewLazyDLL("gdi32.dll")
	winShell32               = syscall.NewLazyDLL("shell32.dll")
	winRegisterClassEx       = winUser32.NewProc("RegisterClassExW")
	winCreateWindowEx        = winUser32.NewProc("CreateWindowExW")
	winDefWindowProc         = winUser32.NewProc("DefWindowProcW")
	winShowWindow            = winUser32.NewProc("ShowWindow")
	winUpdateWindow          = winUser32.NewProc("UpdateWindow")
	winGetMessage            = winUser32.NewProc("GetMessageW")
	winTranslateMessage      = winUser32.NewProc("TranslateMessage")
	winDispatchMessage       = winUser32.NewProc("DispatchMessageW")
	winPostMessage           = winUser32.NewProc("PostMessageW")
	winDestroyWindow         = winUser32.NewProc("DestroyWindow")
	winPostQuitMessage       = winUser32.NewProc("PostQuitMessage")
	winSetWindowText         = winUser32.NewProc("SetWindowTextW")
	winSendMessage           = winUser32.NewProc("SendMessageW")
	winSetTimer              = winUser32.NewProc("SetTimer")
	winKillTimer             = winUser32.NewProc("KillTimer")
	winMessageBox            = winUser32.NewProc("MessageBoxW")
	winEnableWindow          = winUser32.NewProc("EnableWindow")
	winLoadCursor            = winUser32.NewProc("LoadCursorW")
	winGetStockObject        = winGDI32.NewProc("GetStockObject")
	winGetModuleHandle       = winKernel32.NewProc("GetModuleHandleW")
	winGetStdHandle          = winKernel32.NewProc("GetStdHandle")
	winGetConsoleMode        = winKernel32.NewProc("GetConsoleMode")
	winSetConsoleMode        = winKernel32.NewProc("SetConsoleMode")
	winGetConsoleWindow      = winKernel32.NewProc("GetConsoleWindow")
	winGetConsoleProcessList = winKernel32.NewProc("GetConsoleProcessList")
	winShellExecute          = winShell32.NewProc("ShellExecuteW")
	desktopWindowCallback    = syscall.NewCallback(desktopWindowProcedure)
	desktopWindows           sync.Map
)

type winPoint struct {
	X int32
	Y int32
}

type winMessage struct {
	Window  uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Point   winPoint
	Private uint32
}

type winWindowClass struct {
	Size            uint32
	Style           uint32
	WindowProcedure uintptr
	ClassExtra      int32
	WindowExtra     int32
	Instance        uintptr
	Icon            uintptr
	Cursor          uintptr
	Background      uintptr
	MenuName        *uint16
	ClassName       *uint16
	SmallIcon       uintptr
}

type windowsDesktopWindow struct {
	status         *desktopStatus
	diagnosticsURL string
	logDirectory   string
	stop           chan struct{}
	stopOnce       sync.Once
	ready          chan error
	window         atomic.Uintptr
	statusText     uintptr
	connectionText uintptr
	detailsText    uintptr
	countersText   uintptr
	messageText    uintptr
	stopButton     uintptr
}

func startDesktopWindow(status *desktopStatus, diagnosticsURL, logDirectory string) (desktopWindow, error) {
	window := &windowsDesktopWindow{
		status: status, diagnosticsURL: diagnosticsURL, logDirectory: logDirectory,
		stop: make(chan struct{}), ready: make(chan error, 1),
	}
	go window.run()
	if err := <-window.ready; err != nil {
		return nil, err
	}
	return window, nil
}

func (window *windowsDesktopWindow) StopRequested() <-chan struct{} { return window.stop }

func (window *windowsDesktopWindow) Close() {
	if handle := window.window.Load(); handle != 0 {
		winPostMessage.Call(handle, winCloseMessage, 0, 0)
	}
}

func (window *windowsDesktopWindow) run() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	instance, _, instanceErr := winGetModuleHandle.Call(0)
	if instance == 0 {
		window.ready <- fmt.Errorf("GetModuleHandleW: %w", instanceErr)
		return
	}
	className := utf16Pointer("A7TagamPrintAgentWindow")
	title := utf16Pointer("A7-tagam — программа печати чеков")
	cursor, _, _ := winLoadCursor.Call(0, 32512)
	class := winWindowClass{
		Size: uint32(unsafe.Sizeof(winWindowClass{})), WindowProcedure: desktopWindowCallback,
		Instance: instance, Cursor: cursor, Background: 6, ClassName: className,
	}
	atom, _, registerErr := winRegisterClassEx.Call(uintptr(unsafe.Pointer(&class)))
	if atom == 0 {
		window.ready <- fmt.Errorf("RegisterClassExW: %w", registerErr)
		return
	}
	handle, _, createErr := winCreateWindowEx.Call(
		0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(title)),
		winWSOverlapped|winWSCaption|winWSSysMenu|winWSMinimizeBox,
		winCWUseDefault, winCWUseDefault, 720, 500,
		0, 0, instance, 0,
	)
	if handle == 0 {
		window.ready <- fmt.Errorf("CreateWindowExW: %w", createErr)
		return
	}
	window.window.Store(handle)
	desktopWindows.Store(handle, window)
	if err := window.createControls(instance); err != nil {
		desktopWindows.Delete(handle)
		winDestroyWindow.Call(handle)
		window.window.Store(0)
		window.ready <- err
		return
	}
	if timer, _, timerErr := winSetTimer.Call(handle, winStatusTimer, 500, 0); timer == 0 {
		desktopWindows.Delete(handle)
		winDestroyWindow.Call(handle)
		window.window.Store(0)
		window.ready <- fmt.Errorf("SetTimer: %w", timerErr)
		return
	}
	window.render()
	winShowWindow.Call(handle, winSWShow)
	winUpdateWindow.Call(handle)
	disableConsoleQuickEdit()
	hideConsoleWindow()
	window.ready <- nil

	var message winMessage
	for {
		result, _, messageErr := winGetMessage.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(result) == -1 {
			showDesktopMessage(handle, "Ошибка окна", fmt.Sprintf("Не удалось обработать сообщение Windows: %v", messageErr), winMBOK|winMBIconWarning)
			break
		}
		if result == 0 {
			break
		}
		winTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		winDispatchMessage.Call(uintptr(unsafe.Pointer(&message)))
	}
	window.window.Store(0)
}

func (window *windowsDesktopWindow) createControls(instance uintptr) error {
	font, _, _ := winGetStockObject.Call(winDefaultGUIFont)
	window.statusText = createDesktopControl("STATIC", "Состояние: запускается", 28, 24, 650, 30, 0, 0, window.window.Load(), instance)
	window.connectionText = createDesktopControl("STATIC", "API: ожидаем подключение", 28, 66, 650, 24, 0, 0, window.window.Load(), instance)
	window.detailsText = createDesktopControl("STATIC", "Текущий заказ: нет", 28, 102, 650, 50, winWSBorder, 0, window.window.Load(), instance)
	window.countersText = createDesktopControl("STATIC", "Передано: 0    Ошибок: 0", 28, 166, 650, 24, 0, 0, window.window.Load(), instance)
	window.messageText = createDesktopControl("STATIC", "Программа запускается…", 28, 204, 650, 76, winWSBorder, 0, window.window.Load(), instance)
	diagnosticsButton := createDesktopControl("BUTTON", "Диагностика аппаратов", 28, 310, 190, 36, 0, winButtonDiagnostics, window.window.Load(), instance)
	logsButton := createDesktopControl("BUTTON", "Журналы", 232, 310, 120, 36, 0, winButtonLogs, window.window.Load(), instance)
	window.stopButton = createDesktopControl("BUTTON", "Остановить печать", 500, 310, 178, 36, 0, winButtonStop, window.window.Load(), instance)
	helpText := createDesktopControl("STATIC", "Крестик не останавливает программу. Для остановки используйте отдельную кнопку и подтвердите действие.", 28, 372, 650, 44, 0, 0, window.window.Load(), instance)
	controls := []uintptr{
		window.statusText, window.connectionText, window.detailsText, window.countersText,
		window.messageText, diagnosticsButton, logsButton, window.stopButton, helpText,
	}
	for _, control := range controls {
		if control == 0 {
			return errors.New("Windows не создал все элементы окна")
		}
	}
	for _, control := range []uintptr{window.statusText, window.connectionText, window.detailsText, window.countersText, window.messageText, window.stopButton} {
		if control != 0 {
			winSendMessage.Call(control, winWMSetFont, font, 1)
		}
	}
	return nil
}

func createDesktopControl(className, text string, x, y, width, height int32, extraStyle uint32, id int, parent, instance uintptr) uintptr {
	classPointer := utf16Pointer(className)
	textPointer := utf16Pointer(text)
	handle, _, _ := winCreateWindowEx.Call(
		0, uintptr(unsafe.Pointer(classPointer)), uintptr(unsafe.Pointer(textPointer)),
		uintptr(winWSChild|winWSVisible|extraStyle), uintptr(x), uintptr(y), uintptr(width), uintptr(height),
		parent, uintptr(id), instance, 0,
	)
	if handle != 0 {
		font, _, _ := winGetStockObject.Call(winDefaultGUIFont)
		winSendMessage.Call(handle, winWMSetFont, font, 1)
	}
	return handle
}

func desktopWindowProcedure(handle uintptr, message uint32, wParam, lParam uintptr) uintptr {
	value, found := desktopWindows.Load(handle)
	if !found {
		result, _, _ := winDefWindowProc.Call(handle, uintptr(message), wParam, lParam)
		return result
	}
	window := value.(*windowsDesktopWindow)
	switch message {
	case winWMTimer:
		if wParam == winStatusTimer {
			window.render()
			return 0
		}
	case winWMCommand:
		window.command(int(wParam & 0xffff))
		return 0
	case winWMClose:
		showDesktopMessage(handle, "Печать продолжает работать", "Окно нельзя закрыть случайно. Чтобы действительно остановить печать, нажмите «Остановить печать» и подтвердите действие.", winMBOK|winMBIconInfo)
		return 0
	case winCloseMessage:
		winDestroyWindow.Call(handle)
		return 0
	case winWMDestroy:
		winKillTimer.Call(handle, winStatusTimer)
		desktopWindows.Delete(handle)
		winPostQuitMessage.Call(0)
		return 0
	}
	result, _, _ := winDefWindowProc.Call(handle, uintptr(message), wParam, lParam)
	return result
}

func (window *windowsDesktopWindow) command(id int) {
	switch id {
	case winButtonDiagnostics:
		window.open(window.diagnosticsURL)
	case winButtonLogs:
		if window.logDirectory == "" {
			showDesktopMessage(window.window.Load(), "Журналы недоступны", "Папка журналов не настроена.", winMBOK|winMBIconWarning)
			return
		}
		window.open(window.logDirectory)
	case winButtonStop:
		answer := showDesktopMessage(
			window.window.Load(),
			"Остановить печать?",
			"После остановки новые чеки не выйдут, пока программу снова не запустят. Задания сохранятся в очереди сервера. Остановить программу?",
			winMBYesNo|winMBIconWarning|winMBDefButton2,
		)
		if allowDesktopShutdown(true, answer == winIDYes) {
			window.status.stopping()
			winEnableWindow.Call(window.stopButton, 0)
			window.stopOnce.Do(func() { close(window.stop) })
		}
	}
}

func (window *windowsDesktopWindow) open(target string) {
	operation := utf16Pointer("open")
	targetPointer := utf16Pointer(target)
	result, _, _ := winShellExecute.Call(window.window.Load(), uintptr(unsafe.Pointer(operation)), uintptr(unsafe.Pointer(targetPointer)), 0, 0, winSWShow)
	if result <= 32 {
		showDesktopMessage(window.window.Load(), "Не удалось открыть", "Windows не смог открыть выбранный раздел. Код ошибки: "+fmt.Sprint(result), winMBOK|winMBIconWarning)
	}
}

func (window *windowsDesktopWindow) render() {
	snapshot := window.status.snapshotValue()
	phase := map[string]string{
		"STARTING": "запускается", "READY": "работает", "PRINTING": "передаёт чек",
		"ATTENTION": "нужна проверка", "RETRYING": "ждёт безопасный повтор", "STOPPING": "останавливается",
	}[snapshot.Phase]
	if phase == "" {
		phase = "неизвестно"
	}
	setDesktopText(window.statusText, fmt.Sprintf("Состояние: %s    Версия: %s    Адрес: %s", phase, snapshot.Version, snapshot.ListenAddress))
	connection := "API: не настроен — требуется отдельный ключ программы печати"
	if snapshot.APIConfigured {
		connection = "API: подключаемся…"
	}
	if !snapshot.APILastSeen.IsZero() {
		age := time.Since(snapshot.APILastSeen)
		if age <= 45*time.Second {
			connection = "API: связь есть · последний ответ " + snapshot.APILastSeen.Format("15:04:05")
		} else {
			connection = "API: нет недавнего ответа · последний ответ " + snapshot.APILastSeen.Format("15:04:05")
		}
	}
	if snapshot.APIUnavailable {
		connection = "API: связи сейчас нет — программа повторяет автоматически"
	}
	if snapshot.StationID != "" {
		if snapshot.APIConfigured {
			connection += " · ID станции: " + snapshot.StationID
		} else {
			connection = "API: не настроен · ID станции: " + snapshot.StationID
		}
	}
	setDesktopText(window.connectionText, connection)
	details := "Текущий заказ: нет"
	if snapshot.CurrentOrder > 0 {
		document := "заказ"
		if snapshot.DocumentType == documentTypeCancel {
			document = "отмена"
		}
		details = fmt.Sprintf("Текущий заказ: №%d · %s · копия %d из %d", snapshot.CurrentOrder, document, snapshot.CopyIndex, snapshot.CopyCount)
		if snapshot.PrinterTarget != "" {
			details += " · аппарат " + snapshot.PrinterTarget
		}
	}
	setDesktopText(window.detailsText, details)
	setDesktopText(window.countersText, fmt.Sprintf("Передано аппарату: %d    Ошибок передачи: %d", snapshot.SentCopies, snapshot.FailedCopies))
	setDesktopText(window.messageText, snapshot.LastMessage)
}

func setDesktopText(handle uintptr, value string) {
	if handle == 0 {
		return
	}
	pointer := utf16Pointer(value)
	winSetWindowText.Call(handle, uintptr(unsafe.Pointer(pointer)))
}

func showDesktopMessage(parent uintptr, title, body string, style uintptr) uintptr {
	titlePointer := utf16Pointer(title)
	bodyPointer := utf16Pointer(body)
	result, _, _ := winMessageBox.Call(parent, uintptr(unsafe.Pointer(bodyPointer)), uintptr(unsafe.Pointer(titlePointer)), style)
	return result
}

func utf16Pointer(value string) *uint16 {
	pointer, err := syscall.UTF16PtrFromString(value)
	if err != nil {
		panic(errors.New("текст окна содержит недопустимый нулевой символ"))
	}
	return pointer
}

func disableConsoleQuickEdit() {
	input, _, _ := winGetStdHandle.Call(winStdInputHandle)
	if input == 0 || input == ^uintptr(0) {
		return
	}
	var mode uint32
	result, _, _ := winGetConsoleMode.Call(input, uintptr(unsafe.Pointer(&mode)))
	if result == 0 {
		return
	}
	mode |= winExtendedFlags
	mode &^= winEnableQuickEdit
	winSetConsoleMode.Call(input, uintptr(mode))
}

func hideConsoleWindow() {
	handle, _, _ := winGetConsoleWindow.Call()
	if handle == 0 {
		return
	}
	// A double-clicked console executable owns its console alone. If it was
	// started from an existing terminal, never hide that shared terminal.
	var processIDs [2]uint32
	count, _, _ := winGetConsoleProcessList.Call(uintptr(unsafe.Pointer(&processIDs[0])), uintptr(len(processIDs)))
	if count == 1 {
		winShowWindow.Call(handle, winSWHide)
	}
}
