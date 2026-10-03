package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"os/exec"
	"strings"
	"unicode/utf16"
)

// Keep the process protocol platform-independent so the Windows stderr/JSON
// regression can be exercised on every development and CI host.
func encodePowerShell(script string) string {
	words := utf16.Encode([]rune(script))
	data := make([]byte, 2*len(words))
	for i, word := range words {
		binary.LittleEndian.PutUint16(data[2*i:], word)
	}
	return base64.StdEncoding.EncodeToString(data)
}

func newPowerShellCommand(ctx context.Context, script string) *exec.Cmd {
	// Windows PowerShell 5.1 may emit module-initialization progress as CLIXML.
	// Suppress progress, but keep terminating errors and explicit text output.
	preamble := "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); "
	return exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-EncodedCommand", encodePowerShell(preamble+script))
}

func powerShellOutput(cmd *exec.Cmd) ([]byte, error) {
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	// Never merge stderr into stdout: successful commands can still emit
	// '#< CLIXML' diagnostics, which are not part of the JSON adapter list.
	out, err := cmd.Output()
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = strings.TrimSpace(string(out))
		}
		if detail == "" {
			return nil, fmt.Errorf("Windows: %w", err)
		}
		return nil, fmt.Errorf("Windows: %s: %w", detail, err)
	}
	return bytes.TrimPrefix(bytes.TrimSpace(out), []byte{0xef, 0xbb, 0xbf}), nil
}
