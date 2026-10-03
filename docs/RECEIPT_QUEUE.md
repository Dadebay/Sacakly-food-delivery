# Durable receipt queue — 2026-09-04

The standalone-agent revision is implemented in API, admin and Go agent.
Production push/deployment was authorized by the user on 2026-09-19.
The Windows investigation is preserved in [the handoff](RECEIPT_PRINTING_WINDOWS_HANDOFF.md).
The 2026-09-25 queue changes are pushed to `codex/map-delivery-zones` for review;
the current request explicitly excludes deployment.

## Delivery contract

- `OrdersService.createForCustomer` inserts `ORDER_CREATED:<orderId>` with the
  order transaction for both customer/API and staff phone orders. Cancellation
  inserts `ORDER_CANCELLED:<orderId>` in its transaction. An outbox failure rolls
  back the transaction; a disconnected workstation never prevents its commit.
- Migration `20260904010000_durable_receipt_queue` adds tasks, a permanent queue
  lock row and optional order-creation idempotency records. There is no old-order
  backfill. Web/mobile clients can reuse `idempotencyKey` for creation retries;
  the phone-order hook does so until success or a changed request body.
- Each task stores a frozen backend receipt plan and unique `dispatchId`.
  Main-printer selection is resolved at enqueue time; kitchen routes remain
  order-line snapshots. Retrying never regenerates the payload. An explicit
  new reprint obtains current main settings and a new dispatch identity.
- The API calculates kitchen eligibility from snapshotted preparation times and
  persists `nextAttemptAt`. It creates one immediate task per configured main
  copy (1–3); only the first carries immediate kitchen jobs. Later kitchen
  tasks have no main job. Manual printing cancels outstanding automatic tasks
  and creates one task per requested main copy. Every task uses the unchanged
  single-main-job protocol understood by existing print agents.
- The standalone EXE claims directly from NestJS with the dedicated
  `RECEIPT_AGENT_API_TOKEN` and sends its persistent journal station UUID in
  `X-Receipt-Agent-Id`. It never reads a browser JWT. PostgreSQL serializes claim selection with a row
  lock; there is at most one active lease. The lease lasts 180 seconds with
  30-second heartbeats. Claims carry a random lease token and persistent Go
  `agentId`; stale/foreign tokens cannot change the outcome.
- Once claimed, the task stays bound to that installation. Lease recovery never
  sends an old potentially completed task to another workstation. Replacing an
  EXE under the same OS account preserves identity; deleting its journal or
  switching OS accounts does not. Queue UI identifies tasks waiting for their
  original workstation.
- API/network/agent outages preserve tasks. Definitively unsent copies retry
  indefinitely with exponential delay capped at 60 seconds. The three-second
  EXE poll resumes pending work without a browser. Only the visible
  print agent, internet connection and printer LAN must be available.
- Go serializes entire dispatches, fsyncs a `started` record before each copy,
  then a `sent` or definitely-unsent `retryable` result. A completed copy is
  returned from its journal without printer I/O. A request with the same ID but
  different content fails with conflict. A supplied mismatched agent ID fails
  before printer I/O. A RAW TCP endpoint has a 1.5-second cooldown across copies
  and orders, retaining main/kitchen as intentionally separate copies.
- A partial write, unknown HTTP result, unfinished `started` record, torn record
  or journal storage failure produces `UNCERTAIN`. Automatic retries stop;
  staff inspect the paper before deliberately creating a new copy. Never infer
  physical paper from a successful TCP write: API `DELIVERED` means the agent
  reported all transport sends complete, and audit metadata says
  `paperConfirmed: false`.
- Journals contain only fingerprints and per-copy results, not receipt/customer
  content or credentials. They are not automatically evicted. A process file
  lock permits one writer. Support-log rotation/export never removes journals.
  Disk-full or corrupt storage fails closed instead of bypassing deduplication.
- Manual reprint is explicit and has a separate HTTP idempotency key. It can
  intentionally reproduce previously printed copies; the UI asks for paper
  confirmation. A failed manual-request response retains its key for retry.
  Missing printer routes require configuration and a fresh print plan. An
  administrator may omit individual dishes from both the main and kitchen
  copies; the API rejects an empty selection and retains the full order total
  with a visible partial-print warning on the paper. Operators retain the
  saved full-order route. Reusing a key with a different selection returns
  a conflict.
- Full order cancellation removes pending/failed ORDER tasks (automatic, edited
  and manual) from the queue. It queues exactly one full main cancellation,
  regardless of the normal copy setting. Kitchen cancellation contains only
  delivered kitchen portions, grouped by their actual sent endpoint. An
  unprinted delayed dish produces neither its original ticket nor a cancellation.
- Administrator food edits remove unprinted dishes without a paper cancellation.
  Quantity-only changes update the same unattempted kitchen task without moving
  its due time. Other dishes in a shared task remain. Adding food or changing the
  longest preparation time reschedules unprinted lines from the edit time;
  newly added dishes follow the same preparation-time difference. Delivered
  reductions/removals create one cancellation for the removed portions; increases
  print only additional portions. Main-only delivery never counts as kitchen
  delivery, and a manual copy does not count as extra portions. Pending item
  cancellations survive subsequent edits and full cancellation.
- Retained product/variant lines keep their IDs. Old replaced line IDs can be
  related through a unique name/variant/price match recorded in audit aliases;
  frozen dispatch payloads are never rewritten. Waiting main copies are replaced
  with the corrected order. Food edits conflict during processing, uncertainty
  or a pending attempted send. Every adjustment/cancellation is transactional
  and audited under the same queue lock as claims and acknowledgments.
- Full cancellation may commit during a send. A later successful acknowledgment
  queues the remaining kitchen cancellation only, without another main copy.
  A retry or expired lease for an original ORDER after cancellation stops as
  UNCERTAIN for inspection; it cannot resume cooking tickets. A matching late
  successful acknowledgment can still resolve that stopped task. An offline
  print agent never rolls back a committed order cancellation.
- An administrator can manually cancel one `PENDING` task, including a future
  kitchen ticket. The queue displays the task's dish names. A processing or
  delivered task cannot be recalled from the apparatus.

## API

Staff management paths under `/api/v1` require an active `OPERATOR`, `ADMIN` or
`SUPER_ADMIN` session:

| Method / path | Purpose |
| --- | --- |
| GET `/receipt-print-tasks` | First 50 outstanding tasks, dish names, counts and `consumerMode`; no customer payload |
| POST `/receipt-print-tasks/claim` | Atomically claim one eligible task for `stationId` |
| POST `/receipt-print-tasks/:id/heartbeat` | Renew matching actor/station/claim token |
| POST `/receipt-print-tasks/:id/outcome` | Record `DELIVERED`, `RETRY`, `UNCERTAIN` or `FAILED` |
| POST `/receipt-print-tasks/:id/retry` | Move a safe pending/failed task's retry time to now; cannot reset uncertainty |
| POST `/receipt-print-tasks/:id/cancel` | Administrator-only audited cancellation of a `PENDING` task |
| POST `/receipt-print-tasks/orders/:orderId/reprint` | Audited, intentional new dispatch, deduplicated by request key |

The EXE has a separate least-privilege bearer key and only these paths:

| Method / path | Purpose |
| --- | --- |
| POST `/receipt-agent/tasks/claim` | Claim one task for the station UUID sent by the EXE |
| POST `/receipt-agent/tasks/:id/heartbeat` | Renew that station's matching lease token |
| POST `/receipt-agent/tasks/:id/outcome` | Record the transport outcome with `PRINT_AGENT` audit metadata |

Setting `RECEIPT_AGENT_API_TOKEN` enables direct mode. The key must contain at
least 12 characters and is compared in constant time. The station header must
be a UUID v4. Direct mode makes the staff/browser claim endpoint return no task,
while queue listing, safe retry and deliberate reprint remain available.

The preexisting receipt-plan endpoint remains available for compatibility.
`NewOrderAlert` is now notification-only; no client seen-ID list or cancellation
success callback is a delivery trigger. Swagger and shared types are generated
with `npm run api:client`.

## Verification

- The new migration applies successfully to the local database and the isolated
  test database; the new queue tables match Prisma. A full local schema diff
  still reports preexisting defaults on `ContactSettings.updatedAt`,
  `ReceiptPrintSettings.updatedAt`, and `LoginAttempt.id`, plus the existing
  `LoginAttempt.userId` foreign-key action difference. These unrelated columns
  were not altered by this migration.
- API: 118 tests including real HTTP/PostgreSQL rollback, both creation paths,
  concurrent create/claim/reprint, nested-payload conflicts, lease expiration,
  foreign/stale acknowledgments, long outages, cancellation and forbidden roles.
  Coverage: 89.85% statements, 74.52% branches, 91.18% functions, 91.07% lines.
- Admin: 135 tests, production build and lint. Behavioral worker tests cover lost
  replies, matching result validation, lost backend ACK, uncertainty and offline
  handling. Existing route/order/permission tests remain enabled.
- Go: race tests, vet and five cross-builds (Windows x64/x86/ARM64; Mac
  Apple Silicon/Intel). Tests include real HTTP response loss, journal restart,
  concurrent dispatches, partial-copy retry, ambiguous writes, torn/inaccessible
  journal, identity mismatch, process locking and cooldown across orders.
- Existing dependency audit findings were resolved by exact API transitive pins
  `fast-uri 4.1.4`, `mysql2 3.24.3`, `qs 6.16.0`. API development/production and
  admin audits report zero vulnerabilities. The admin dependency tree is unchanged.
- The ignored `outputs/receipt-queue-20260904/` directory contains the local QA
  script/report/screenshots and release packages. It runs the production admin,
  actual NestJS API against isolated `alofood_test`, actual Go binary and a TCP
  sink bound to this Mac. It never sends to physical receipt printers.
- Seven measured delivery scenarios: phone order before first page load; two
  competing tabs; disconnected/reconnected printer; lost agent reply plus page
  reload; lost backend ACK plus Go restart and lease recovery; intentional
  reprint and cancellation; ambiguous J-Speed HTTP error stopping auto retry.
  The sink received exactly fourteen expected main/kitchen copies, with no
  extra connections on replay. This is software verification, not a Windows
  hardware receipt test.
- Chromium, Firefox and WebKit were exercised at 1366 px and 390 px against the
  running API, with the order board fully loaded, no horizontal overflow and
  no runtime page errors. Queue disclosure also works by keyboard. Branded
  Windows Chrome/Edge, desktop Safari and physical mobile devices were not
  separately run. A 162-file TypeScript import graph check found no cycles;
  frontend hygiene passed against the repository's actual `origin/main` base.
- During 11 idle seconds, one visible tab made two backlog polls and two local
  health polls, zero claims and zero DOM mutations in the order board. The queue
  does not invalidate order queries. The production entry is 242.14 KB / 77.68 KB
  gzip; order board 58.44 KB / 16.34 KB gzip; queue CSS 0.70 KB / 0.35 KB gzip.
  No runtime dependency was added. These local measurements do not establish
  production p75 Core Web Vitals or exact React render counts.

## Coordinated rollout and rollback

The user explicitly authorized push and production deployment on 2026-09-04.
Use the repository's `main` → GitHub Actions → VDS deployment flow and its
documented domestic fallback when hosted-runner SSH is unreachable.
No manual database edits or Sites release.

1. Close old frontend tabs on every printing workstation and stop old agents.
   Mixed old/new frontend versions can still originate separate print requests;
   a UUID journal cannot recognize two independently allocated identities as
   the same intended receipt.
2. Install the new EXE/binary using the same OS account. Preserve the journal:
   Windows `%APPDATA%\A7-tagam\PrintAgent\dispatches`; Mac
   `~/Library/Application Support/A7-tagam/PrintAgent/dispatches`.
3. Deploy migration/API/admin as one coordinated release. The migration does not
   print historical orders; newly committed orders become pending tasks.
4. Reopen the updated site on the printing workstation, check queue health and
   perform one controlled order with its expected main/kitchen copies. Check a
   disconnect/reconnect and verify no additional replayed copy appears.
5. Keep the site and agent running for queue consumption. If the original
   workstation is unavailable, preserve its outstanding tasks and inspect
   receipts before intentionally reprinting elsewhere; do not clear binding or
   journal to force a retry.

If a release is rolled back, close the queue consumers first and preserve both
PostgreSQL tasks and local journals. Do not re-enable old auto-print observers
against outstanding new-queue orders: they can allocate independent identities.
Prefer leaving intake available with printing paused, then resume the new
consumer after the fix. No destructive down migration is needed.

## Dev Notes

http://127.0.0.1:4310/orders (local QA URL; processes stopped at handoff)

Проверить:
- Заказ через API и по телефону появляется в очереди, даже если сайт был закрыт.
- Две вкладки получают одно задание; главный и кухонный чек остаются отдельными.
- Отключение сети сохраняет очередь; возврат связи продолжает неотправленные копии.
- Потеря ответа и перезапуск программы не повторяют выполненные копии.
- Неизвестный результат требует проверки бумаги; новая копия создаётся явно.
- Отмена создаёт отдельный чек, а запрет ролей проверяет сервер.
- Desktop/mobile очередь, раскрытие, ожидание, ошибки и ручные действия.
- На реальном Windows 10 со свитчем — проверить новую сборку после согласованного
  обновления сайта. Физическая Windows-печать новой сборкой локально не проверялась.

## Manual print controls — 2026-09-26

The admin print dialog has a main-cash-register selector (no print / 1 / 2 / 3
copies), an include checkbox per dish, and a kitchen destination per included
dish. It scrolls the dish list inside the viewport and keeps actions visible.

`POST /receipt-print-tasks/orders/:id/reprint` accepts optional `mainCopies`
(integer 0–3, ADMIN/SUPER_ADMIN only). Zero removes `mainJob` from all newly
queued tasks; positive values require a configured main printer. Omission
retains existing configured defaults and retry compatibility. The choice is
per request, is audit logged, and never changes automatic printing settings.
Changing the count with an already-used idempotency key returns 409.

When main printing is off, each included dish needs a kitchen destination.
Invalid selections return 400 before any automatic tasks are cancelled.
Unchecked dishes use the existing `itemRoutes[].skip: true` contract. Existing
print-agent binaries keep receiving the same ordinary queue tasks.
