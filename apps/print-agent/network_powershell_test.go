package main

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"unicode/utf16"
)

const powerShellTestJSON = `[{"name":"Кабель кухни","index":14,"mac":"00:11:22:33:44:55","wired":true,"up":true,"dhcp":false,"gateway":"","addresses":["192.168.123.10/24","192.168.0.10/24"]}]`
const powerShellTestProgress = "#< CLIXML\r\n<Objs Version=\"1.1.0.1\" xmlns=\"http://schemas.microsoft.com/powershell/2004/04\"><Obj S=\"progress\"><MS><PR N=\"Record\"><AV>Preparing modules for first use.</AV></PR></MS></Obj></Objs>\r\n"

// A real child process exercises separate stdout/stderr pipes without requiring
// Windows or PowerShell on the machine running the regression suite.
func TestPowerShellOutputHelperProcess(t *testing.T) {
	if os.Getenv("A7_POWERSHELL_TEST_HELPER") != "1" {
		return
	}
	mode := os.Args[len(os.Args)-1]
	fmt.Fprint(os.Stderr, powerShellTestProgress)
	switch mode {
	case "success":
		fmt.Fprintln(os.Stdout, powerShellTestJSON)
	case "bom":
		fmt.Fprint(os.Stdout, "\xef\xbb\xbf"+powerShellTestJSON+"\r\n")
	case "empty":
		fmt.Fprintln(os.Stdout, "[]")
	case "failed":
		fmt.Fprintln(os.Stdout, powerShellTestJSON)
		fmt.Fprintln(os.Stderr, "Access denied while reading adapters")
		os.Exit(1)
	case "malformed":
		fmt.Fprintln(os.Stdout, "# unexpected stdout\n"+powerShellTestJSON)
	default:
		os.Exit(2)
	}
	os.Exit(0)
}

func powerShellTestCommand(t *testing.T, mode string) *exec.Cmd {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.CommandContext(t.Context(), executable, "-test.run=^TestPowerShellOutputHelperProcess$", "--", mode)
	cmd.Env = append(os.Environ(), "A7_POWERSHELL_TEST_HELPER=1")
	return cmd
}

func TestPowerShellProgressDoesNotCorruptAdapterJSON(t *testing.T) {
	for _, mode := range []string{"success", "bom", "empty"} {
		t.Run(mode, func(t *testing.T) {
			out, err := powerShellOutput(powerShellTestCommand(t, mode))
			if err != nil {
				t.Fatal(err)
			}
			var adapters []networkAdapter
			if err := json.Unmarshal(out, &adapters); err != nil {
				t.Fatalf("progress corrupted adapter JSON: %v", err)
			}
			if mode == "empty" {
				if adapters == nil || len(adapters) != 0 {
					t.Fatalf("expected an empty adapter list: %+v", adapters)
				}
				return
			}
			if len(adapters) != 1 || adapters[0].Name != "Кабель кухни" || adapters[0].Index != 14 || !adapters[0].Wired || !adapters[0].Up || adapters[0].DHCP || adapters[0].Gateway != "" || !slices.Equal(adapters[0].Addresses, []string{"192.168.123.10/24", "192.168.0.10/24"}) {
				t.Fatalf("adapter settings were not preserved: %+v", adapters)
			}
		})
	}
}

func TestPowerShellFailureCannotBeMistakenForSuccessfulJSON(t *testing.T) {
	out, err := powerShellOutput(powerShellTestCommand(t, "failed"))
	var exitError *exec.ExitError
	if out != nil || !errors.As(err, &exitError) || exitError.ExitCode() != 1 || !strings.Contains(err.Error(), "Access denied while reading adapters") {
		t.Fatalf("lost command failure: output=%s error=%v", out, err)
	}
}

func TestPowerShellMalformedStdoutIsNotSilentlyRepaired(t *testing.T) {
	out, err := powerShellOutput(powerShellTestCommand(t, "malformed"))
	if err != nil {
		t.Fatal(err)
	}
	var adapters []networkAdapter
	if json.Unmarshal(out, &adapters) == nil {
		t.Fatal("unexpected stdout was accepted as trustworthy network settings")
	}
}

func TestPowerShellCommandUsesTextAndPreservesUnicode(t *testing.T) {
	script := "Write-Output 'Кабель кухни — 🖨'"
	cmd := newPowerShellCommand(context.Background(), script)
	format := slices.Index(cmd.Args, "-OutputFormat")
	encoded := slices.Index(cmd.Args, "-EncodedCommand")
	if format < 0 || format+1 >= len(cmd.Args) || cmd.Args[format+1] != "Text" || encoded < 0 || encoded+1 >= len(cmd.Args) {
		t.Fatalf("missing PowerShell text/encoding arguments: %v", cmd.Args)
	}
	data, err := base64.StdEncoding.DecodeString(cmd.Args[encoded+1])
	if err != nil || len(data)%2 != 0 {
		t.Fatalf("invalid UTF-16 command: %v", err)
	}
	words := make([]uint16, len(data)/2)
	for i := range words {
		words[i] = binary.LittleEndian.Uint16(data[2*i:])
	}
	decoded := string(utf16.Decode(words))
	if !strings.HasSuffix(decoded, script) || !strings.Contains(decoded, "$ProgressPreference='SilentlyContinue'") || !strings.Contains(decoded, "$ErrorActionPreference='Stop'") {
		t.Fatalf("PowerShell command lost script or error handling: %s", decoded)
	}
}
