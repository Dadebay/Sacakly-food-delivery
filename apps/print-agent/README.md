# A7-tagam receipt print agent

The visible print agent is a standalone HTTPS queue worker and private-LAN
printer bridge. It does not need the operations website or its user token.
The backend sends one complete administrator
copy plus kitchen copies grouped by immutable snapshotted printer endpoint; the agent
validates that plan and renders one continuous non-fiscal receipt per copy.
The 80 mm layout (576 printable dots at 203 dpi) has the A7-tagam logo,
business phone, order number/date in Turkmenistan time, delivery details,
a bordered table with number/name/quantity/unit price/amount, delivery,
discount when present, the authoritative total, and Turkmen thanks.
Long names wrap without truncation. Embedded Go Regular/Bold fonts support
Russian and Turkmen without depending on the printer's text code page.
Kitchen copies keep their assigned lines and order comment, omit customer
name/phone/address, and distinguish their line sum from the complete order total.
A cancellation prominently shows its status and full reason.

Both the PNG preview and ESC/POS output use the same monochrome pixels.
RAW TCP sends one connection per copy. J-Speed uses complete raster strips
within its 330-byte payload limit; only the last packet feeds and cuts paper.
Concurrent dispatches are serialized so their strips cannot interleave.
The transport must support ESC/POS `GS v 0` raster printing on 80 mm paper.
Paper movement, density and cutter behavior require a physical device check.

The executable shares one Go codebase with Windows/macOS network helpers. It
claims from `https://a7-tagam.com.tm/api/v1` using the dedicated key read from
`A7_TAGAM_RECEIPT_AGENT_TOKEN` and sends its persistent station ID automatically.
The key is never embedded or logged. It also binds `127.0.0.1:17873` for local
health, diagnostics and compatibility, accepts the production admin origin plus local Vite origins,
and refuses public printer IP addresses and invalid ports. Every job supplies
its own IP, port and transport: standard LAN X-printers normally use `RAW_TCP`
on port `9100`, while legacy J-Speed WebConfig devices use `JSPEED_HTTP` on
port `80`. It accepts two sequential jobs for the same endpoint when the main
and kitchen copies share one physical printer. It does not contain a compiled token.

## Run locally

```bash
A7_TAGAM_RECEIPT_AGENT_TOKEN='<dedicated-test-key>' go run ./apps/print-agent
curl http://127.0.0.1:17873/health
```

Keep normal internet access on Wi-Fi. Give the wired LAN adapter a persistent
address in the printer subnet, for example `192.168.123.10/24` when printers
use `192.168.123.x`; do not configure a gateway on that adapter.

For daily use, start the visible agent; the A7-tagam website may remain closed.
Its close action requires a separate stop confirmation. The agent does not open
a browser page on either Windows or macOS. A7-tagam
supplies each printer endpoint and its assigned items with every print job;
there is no second printer registry to maintain in Go. The optional network
page is not needed while accepting orders. Previously saved network additions
are restored at startup when necessary.

On the Windows workstation with an already configured static Ethernet address,
the prepared **A7-tagam-Print.exe** directly enables `-connect-printers` mode.
Run this one file and keep its visible status window open; do not start another copy before
printing from A7-tagam. Its workstation settings are embedded when building
with `WINDOWS_CONNECT_INTERFACE=Ethernet` and
`WINDOWS_CONNECT_RESERVED=192.168.123.10,192.168.0.240`. Generic builds without
these settings and macOS builds keep the previous opt-in behavior. The CLI flag
can explicitly disable preparation. The older **Подключить аппараты.cmd**
remains an alternative launcher, never a second required step.
The agent obtains endpoints from each validated A7-tagam
print plan; there is no second printer list to enter. Before sending any receipt
bytes, it checks whether the selected Ethernet covers those subnets. A missing
subnet uses the existing elevated, reversible additional-address setup and
native Windows confirmation. The first request returns a clear setup-in-progress
message without sending receipt bytes. After the window says
«Подключение готово», the direct worker retries that order. UAC does not hold an
API lease open. Errors and cancellation never queue a print.
The prepared Windows executable enables this mode locally; a website request
cannot enable it or select an interface/mask. This package selects `Ethernet`
with `/24`, matching this workstation's confirmed configuration, and reserves
the known Mac addresses `192.168.123.10` and `192.168.0.240`. It does not change
DHCP, the original static IP, gateways, DNS, Wi-Fi, printers or site routing.

If another copy is already listening, Windows displays a clear notice. A
matching version and preparation configuration reports that the first copy is
already running; an older version or different mode requires closing that copy
and starting the new executable. No running process is killed, and the check
only reads loopback `/health` without contacting printers or changing settings.
The health response includes the application's identity and active preparation
configuration. The log distinguishes service startup, first allowed browser
health contact, first print preflight, and receipt arrival. A rollback before
any setup reports that there is nothing to undo.

`-network-reserved` supplies a comma-separated list of private IPv4 addresses
that must not be chosen, even when their devices are offline. Reservations are
saved with the recovery journal and retained for restore and subsequent setup.
**Откатить подключение.cmd** invokes the existing rollback for owned aliases.

## Logs to send for support

Logging starts automatically, including startup/listen failures. Each print
records its order number, copy index, endpoint, item count, connection result,
rendered dimensions, send result, elapsed time and network error. The first
successful connection per copy records its local source IP. A J-Speed failure
records how many packets completed. `printer_sent` means data was transmitted;
it does **not** confirm physical paper output. Legacy sites omit `copyType`,
so their jobs are explicitly labelled `UNSPECIFIED`, never guessed as main.

No customer names/phones/addresses, comments, item names/prices, cancellation
reasons, raw request bodies or auth headers are logged. Invalid input is logged
as a rejection category without interpolating caller-provided strings.

- Windows: `%LOCALAPPDATA%\A7-tagam\PrintAgent\logs`
- macOS: `~/Library/Logs/A7-tagam Print Agent`

Files rotate at 2 MiB, retaining the newest ten files. Each process owns its
files; removal of another process's locked files is best-effort on Windows.
Logging failure falls back to the console and never cancels a print job.

Double-click **Собрать логи.cmd** on Windows or **Собрать логи.command** on Mac
from the extracted program folder. It creates `A7-tagam-logs-<timestamp>.zip`
beside the program. Send that ZIP to support. Collection works while the print
agent is running and does not print or modify the network. The ZIP contains
only bounded agent log files plus platform/version/private IPv4 diagnostics;
it does not read the network recovery journal or environment secrets.

CLI equivalents:

```bash
./a7-tagam-print-agent -export-logs
./a7-tagam-print-agent -export-logs -export-output support-case.zip
```

`-log-dir` overrides the source/log directory for local testing. Existing ZIPs
are never overwritten. No logging/export operation uploads data.

## Receipt preview and compatibility

From the repository root, generate a preview without contacting a printer or
changing workstation networking:

```bash
cd apps/print-agent
go run . -preview-input testdata/receipt.json -preview-output receipt-preview.png
```

Use `-preview-job 1` for the second copy in a multi-job request. The sample uses
masked phones; production values come from the authorized API print plan.
The agent embeds its logo and fonts, so no runtime downloads are needed.

`GET /health` advertises `receipt-layout-v2`. The admin sends optional
`metadata` and per-job `copyType` (`MAIN`/`KITCHEN`) only when that capability is
present, keeping older strict agents compatible during rollout. The updated
agent also accepts the old request shape; absent metadata is omitted from the
receipt rather than replaced with invented dates, phones or staff names.
Full order details therefore require updating the API and admin as well.
The agent allows up to 120 seconds for a dispatch; the browser waits 130 seconds
and never retries automatically after a potentially partial print.

Third-party font and library notices are in `THIRD_PARTY_NOTICES.txt` and are
copied beside release binaries.

## Network setup in the same executable

Windows target: **Windows 10 (x86, x64 or ARM64) or newer**, using its built-in
Windows PowerShell 5.1 / NetTCPIP and NetAdapter modules. Go, PowerShell 7,
Python, and additional printer/network utilities do not need to be installed.
Use the x64 executable for a standard 64-bit Intel/AMD Windows computer.
The `windows-386.exe` build is for 32-bit Windows 10.

The Windows helper reads JSON from PowerShell stdout only. Diagnostic stderr
and module-initialization CLIXML progress must never be mixed into that JSON;
progress is suppressed and output format is explicitly text. Failed commands
retain their exit error and diagnostic output. Network-check failures are also
saved in the agent log for the support ZIP.

For initial network repair, diagnostics or rollback, optionally open
`http://127.0.0.1:17873/network` while the agent is running, or launch with
`-open` on either platform. The page checks TCP ports
without sending receipt bytes. After a print attempt, reload it to import the
endpoints from that print plan; before the first attempt, enter the relevant
private IPv4 addresses and ports. These targets are diagnostic inputs, not a
second catalog-routing registry.

Select the physical Ethernet connected to the printer switch and confirm the
printers' subnet mask. Setup supports `/24` through `/29` and adds an address
only for a missing subnet. For example, an existing `192.168.123.x/24` cable
address can coexist with an additional `192.168.0.x/24` address. Never copy a
different workstation's IP. The agent probes candidates using ARP on the
selected Ethernet, excludes its own and printer addresses, and verifies all
requested TCP ports with an explicit cable source address. It sends no print
data during setup. ARP only detects devices currently answering on the link;
reserve the chosen address outside a DHCP pool when the LAN has a DHCP server.

The action opens the native macOS administrator prompt or Windows UAC. Only a
short-lived helper is elevated; the browser bridge keeps its normal user
privileges. Setup refuses Wi-Fi/virtual adapters, disconnected cables, DHCP,
an Ethernet default gateway, another interface using the requested subnet,
and a changed adapter/MAC. It never disables DHCP or changes existing IPs,
subnet masks, gateways, DNS, routers or printer settings. An Ethernet currently
using DHCP needs a separately reviewed static configuration before using this
additional-address workflow.

The protected recovery journal is written before each mutation:

- macOS: `/Library/Application Support/A7-tagam Print Agent/network-state.json`
- Windows: `%ProgramData%\A7-tagam Print Agent\network-state.json`

If a requested printer fails the subsequent connection check, the helper
removes its added addresses. **Rollback** also removes only recorded agent
addresses, matches the physical adapter by MAC, and retains the journal if
cleanup fails. Do not delete that file to resolve an error: use rollback.
The aliases are runtime-only (`ActiveStore` on Windows). After a reboot,
starting the agent restores a previously successful configuration after fresh
ARP checks and, when required, administrator confirmation. It does not install
an operating-system startup service. Keep the agent running while taking orders.

The CLI provides the same workflow (use the interface name returned by check):

```bash
./a7-tagam-print-agent -network check -network-targets '192.168.0.86:9100,192.168.123.100:9100'
./a7-tagam-print-agent -network setup -network-interface en11 -network-prefix 24 -network-targets '192.168.0.86:9100,192.168.123.100:9100'
./a7-tagam-print-agent -network rollback
```

On Windows use the downloaded `.exe` and its Ethernet interface name instead
of `en11`. Start the normal agent without `-network` after a CLI action.
The local settings API requires loopback Host/peer, same-origin requests and
a per-process token. The production website cannot call the network mutation
endpoints. Only the locally enabled `-connect-printers` mode can prepare the
selected static Ethernet from print-plan endpoints before a receipt is sent;
native elevation and all network safety checks still apply.

## Build Windows and macOS executables

```bash
VERSION=0.1.0 ./apps/print-agent/build-release.sh
```

The ignored `apps/print-agent/dist/` directory then contains Intel and ARM
macOS binaries plus x86, x64 and ARM64 Windows executables. GitHub Actions builds
the same five artifacts after formatting, vet and unit tests pass.

Run the matching artifact while the operations admin is open so the server
receipt queue can be consumed automatically, including pending older tasks. On macOS, make
the downloaded artifact executable once before starting it:

```bash
chmod +x a7-tagam-print-agent-darwin-arm64
./a7-tagam-print-agent-darwin-arm64
```

On 64-bit Windows, start `a7-tagam-print-agent-windows-amd64.exe`. Keep its
window open while orders are being accepted; closing it disables printing but
does not affect the website or order acceptance.

## Verification / Dev Notes — 2026-09-03

http://127.0.0.1:17873/network

Проверить:
- Обычный запуск Windows 10 `.exe` без открытия браузера; открытие диагностики
  только вручную или с `-open`, определение физического Ethernet и
  проверку введённых аппаратов без отправки чеков.
- Добавление адреса через UAC, сохранение исходного статического IP, отказ при
  DHCP/шлюзе на Ethernet и пересечении с Wi-Fi.
- Откат только адресов агента, сохранение журнала при ошибке удаления и
  восстановление после перезапуска компьютера/агента.
- Desktop/mobile layout; Windows Edge/Chrome, Firefox и Safari требуют
  отдельной проверки в этих браузерах.

Executed: `go test -race ./...`, `go vet ./...`, all five release cross-builds,
the frontend hygiene check, and local Chromium UI checks at desktop width and
390 px with no horizontal overflow. Invalid/public printer input is rejected;
network mutations require a loopback peer/Host, same origin and token. The
final page has no browser console errors. No external frontend imports or
dependencies were added.

Live macOS setup used native elevation, ARP candidate checks, a saved journal,
and added `192.168.0.240/24` to `en11` while preserving
`192.168.123.10/24` and Wi-Fi DHCP/gateway. All six documented LAN printer
ports accepted a TCP connection without receipt bytes; the production site's
HTTPS HEAD request returned 200. Runtime rollback and reboot restoration are
covered with injected network drivers; they were not exercised on the live
LAN to avoid interrupting working printing. Native Windows 10 execution/UAC
and actual physical receipt output remain unverified on this Mac.

## Durable receipt delivery — direct-agent revision 2026-09-19

The EXE consumes `/receipt-agent/tasks` directly with a separate bearer key.
It sends the persistent `agentId` from `dispatch-journal-v1` in every request,
and every task retains the server's stable `dispatchId`. Once direct mode is
configured, the old staff/browser endpoint cannot claim a task.
A different expected agent ID is rejected before printer I/O. A matching
already-completed dispatch returns its saved result. Reusing a dispatch ID with
other content is a conflict. Main and kitchen copies remain distinct even if
both target one IP and port; RAW TCP sends wait 1.5 seconds after the preceding
copy to that endpoint, including between orders.

The append-only journal is fsynced before each copy and after its outcome.
Definitively zero-byte failures can retry; partial/unknown sends and incomplete
journal records return `uncertain: true` and must not be resent automatically.
`printed` means bytes handed to the transport, never confirmed paper output.
A lost API outcome response does not cancel an accepted physical send. Retries use
the same dispatch ID and consult the journal after the original finishes.

Journal locations (separate from rotating support logs):
- Windows: `%APPDATA%\A7-tagam\PrintAgent\dispatches`
- Mac: `~/Library/Application Support/A7-tagam/PrintAgent/dispatches`

Use the same OS account and preserve this directory when replacing the binary.
Do not delete it to fix a pending queue. A new installation has a different
agent ID and cannot automatically take over old potentially sent tasks.
Only an exclusive journal writer can start; inaccessible/corrupt storage fails
closed. Records contain fingerprints/outcomes, not customer or receipt content,
and have no automatic time-based eviction. `-dispatch-dir` is available for
isolated tests. Changing it in normal operation changes the station identity.

Only the visible agent must stay open for automatic delivery. Closing the site
does not stop printing. Closing the agent preserves pending tasks in PostgreSQL;
reopening it resumes them. Queue protocol, tests and coordinated rollout:
`docs/RECEIPT_QUEUE.md` at repository root.
