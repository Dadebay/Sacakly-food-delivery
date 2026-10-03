# Windows receipt-printing handoff — 2026-09-04

## Evidence collected

The complete Windows Codex conversation (65 user/assistant messages, including
the two requested implementation prompts) and `results/RESULTS.md` were copied
through AnyDesk. The private, ignored evidence bundle is
`outputs/windows-session-20260904/`: original session JSONL, `DISCUSSION.txt`,
`REQUESTED_FIX.txt`, `RESULTS.md`, the completed Windows Go patch, and SHA-256
manifest. Do not commit the raw session or upload it to a third-party service.

## What was fixed on Windows

- The replacement J-Speed printer was identified by disconnect/reconnect and
  its MAC, then assigned `192.168.0.86:9100` on the Ethernet switch.
- Windows retains `192.168.123.21/24` and has the reversible Ethernet alias
  `192.168.0.241/24`. The known Mac addresses remain reserved.
- Happ and Wi-Fi remained enabled. Happ was configured to send
  `a7-tagam.com.tm` directly. Its TUN had previously accepted connections to
  missing LAN endpoints from `172.18.0.1`; that did not prove printer delivery.
- The live site's main apparatus was changed to Han tagam, the same physical
  apparatus as the Test category's kitchen route. Two different copies are
  expected: the complete main receipt and the kitchen receipt.
- The Windows-only diagnostic workspace added a 1,500 ms delay between adjacent
  RAW_TCP copies with the same IP and port. This patch is saved in the evidence
  bundle; it is now integrated into this repository's agent and also applies
  between separate orders.
- Windows version: `receipt-windows-same-printer-cooldown-20260904`. Reported EXE
  SHA-256: `f53aa3c960694d642ac09f754638fc3f23f9ad7f07734418f436dc6a92a95c1d`.
  The Windows session records passing Go tests/vet and order 6 sending two
  49,523-byte copies directly from Ethernet, with `sent: 2`, `failed: 0`.
  The user's subsequent question about two receipts confirms observed paper
  output for that test. This is not a sustained-load or restart-recovery test.

## Confirmed gaps before the queue implementation

1. `features/new-order-alert/ui/new-order-alert.tsx` prints only newly observed
   IDs from the first 100 COOKING/READY orders. The initial snapshot is skipped.
   `model/new-order-alert.ts` writes the localStorage claim before delivery;
   failed delivery does not release it. This is not a durable delivery queue.
2. `features/assisted-order/api/use-assisted-order-actions.ts` invalidates order
   queries after creation; its dialog saves the creation result in UI state.
   Neither explicitly dispatches printing. **The Windows explanation that this
   creation path directly inserts the ID into seen/claimed state is a hypothesis,
   not proven by this source.** A newly observed ID after an established empty
   snapshot does trigger the existing observer, irrespective of source.
3. `orders.service.ts` already routes customer and phone orders through the same
   transactional `createForCustomer` method, but creates no durable print event.
   The Prisma schema contains no receipt outbox. Cancellation printing is also
   tied to the originating browser's success callback.
4. `apps/print-agent/main.go` accepts `dispatchId` but never uses it to suppress
   repeats. Its mutex protects individual physical copies, not an entire HTTP
   dispatch. The Windows cooldown patch does not add durable deduplication.
   Consequently the earlier advice that Go needs no changes for reliable retries
   is insufficient. A server lease alone cannot prevent a second physical print
   after bytes were sent but the acknowledgment was lost.

Characterization run against the actual TypeScript helper on 2026-09-04:
initial snapshot => 0 new IDs; new ID after empty snapshot => 1;
first local claim => true; repeat claim after an unacknowledged/failed send =>
false. This demonstrates concrete loss paths, not the exact historical browser
state during the Windows phone-order failure.

## Requested follow-up implementation

The imported prompt asks for one PostgreSQL print outbox across customer web,
mobile/API and phone-order creation, atomically committed with the order;
unique creation/cancellation events; atomic claims and expiring leases;
bounded retries; visible failures and manual reprint; no historical backfill
that unexpectedly prints old orders. Authorized workstations consume the queue
and use the backend-authoritative plan with the local loopback agent. The VDS
must never connect to private printer addresses.

The design must also handle acknowledgment loss at the agent: a stable dispatch
ID, persisted per-copy send outcomes, safe recovery, and a visibly uncertain
outcome instead of blind retry after a partial/ambiguous send. Physical paper
cannot be atomically committed with PostgreSQL and cannot be claimed confirmed
by a TCP write. Several tabs/stations must not each own the same active dispatch.
Creation HTTP idempotency and receipt-delivery idempotency are separate concerns.

Required verification includes transactional rollback, concurrent creation and
claims, lease recovery, unavailable workstation, partial/ambiguous delivery,
restart/reload, manual reprint, cancellation, and all existing order channels.
The user-requested prompt explicitly forbids production deployment without a
separate authorization. The local implementation now addresses these gaps; see
[`RECEIPT_QUEUE.md`](RECEIPT_QUEUE.md) for the protocol and verification.
The queue migration has been verified locally, but production is not deployed.

Production push and deployment were explicitly authorized on 2026-09-04.
See RECEIPT_QUEUE.md for the current rollout status.
