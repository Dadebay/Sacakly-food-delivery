# Courier map and receipt routing regression contract

This document is the maintenance and QA contract for the all-courier dispatch
map, whole-shift GPS sharing, category visibility, and receipt-printer routing.
The durable business decisions remain in `docs/PROJECT_CONTEXT.md`; this file
records how those decisions are verified.

## Required behavior

### Courier map

- The default dispatch view fits every courier with a GPS point and shows all
  available backend road routes and delivery labels. Every courier has an
  individual numbered marker without clustering. Their marker, drawer number,
  line and order labels share a distinct color, stable when filtering. The name
  menu and `Все курьеры` switch between all and one courier and enable routes.
  Couriers at identical coordinates remain individually selectable in the drawer.
- Routes share individual query keys between overview and selection, load at most
  three at a time, and appear as each succeeds. A GPS update invalidates only that
  courier’s route; missing GPS, a slow route or an error cannot hide other lines.
- Selecting one courier filters out the others, shows that courier's backend
  road route and expands their orders under their name in the drawer: meals,
  quantities, branch, destination, address details, customer contact and comment.
  A missing comment is labelled `Без комментария`.
- The drawer lists all active couriers and can be collapsed. Live GPS does not
  reset a manual pan/zoom; `Вместить в карту` explicitly refits the view.
- Workload and GPS presence are independent. A courier with active orders is
  busy even when the point is `STALE`; `ONLINE`, `STALE`, and `OFFLINE` must
  never be used as substitutes for free/busy state.
- The overview counts busy couriers across all active couriers, free couriers
  only while online, located couriers with a point, online couriers, and the
  total courier count independently.
- If any active courier has no point, the dispatch screen reports GPS coverage,
  names those couriers, and explains how to start the shift at `/courier`.
  Branch labels include `Филиал`; a branch must never look like the missing
  courier. A courier without coordinates stays in the list but receives no
  invented map position.
- Moving an order to `DELIVERED` removes it from `activeOrders`, changes the
  workload label to `Свободен`, and preserves the courier point. The courier
  may continue publishing new points after delivery.
- Mobile publishes approximately every 10–15 seconds for the whole shift,
  including between orders. Only explicit end-of-shift deletion stops sharing.
  A point without new updates becomes `STALE` after five minutes and expires
  from Redis after fifteen minutes.
- The production web fallback `/courier` accepts an authenticated `COURIER`
  session without granting any operations-admin navigation. Its start action
  publishes GPS independently of active orders; its end-shift action is the
  only UI action that deletes the point.

### Category visibility and receipt routing

- `ADMIN` and `SUPER_ADMIN` may hide or show a complete category. Other roles
  are denied by the API.
- Hiding a category removes the category and all of its products from the
  public catalog without changing individual product records, sort order, or
  the configured category printer address. The authenticated admin catalog
  continues to return the hidden category.
- Only private LAN IPv4 addresses are accepted for main, category, and product
  printer routes. An empty quick-settings field stores `null`; the catalog UI
  also provides explicit clear actions for every routing level.
- Effective kitchen routing is exclusive:
  `product.receiptPrinterIp ?? category.receiptPrinterIp`. A product override
  creates one job on the product printer and no duplicate job on the category
  printer.
- Each order item snapshots its effective route. Later catalog changes do not
  reroute an existing order. The complete main-printer job always contains all
  order lines; missing kitchen routes remain visible as unassigned items.
- A fresh database preloads the six discovered private-LAN port-9100 printers
  with editable temporary names. Reapplying migrations does not duplicate an
  endpoint or overwrite an existing operator-managed record.
- `ADMIN` and `SUPER_ADMIN` may permanently delete an unused product or an
  unused category and all of its products after confirmation. The API audits
  the deletion and retains media objects. Any order-history reference protects
  the product and its category with `409 Conflict`; staff must hide the record
  instead.

## Automated coverage

| Area | Test | Contract covered |
| --- | --- | --- |
| Courier markers, route colors and coverage | `apps/admin/tests/courier-map.test.mjs` | Empty/mixed courier sets, every courier retained in the list, markers created only from real coordinates, missing names/phone fallbacks, one/multiple orders, stable distinct overview route colors, courier/order route labels, stale busy courier, online/free and GPS counts, branch distinction |
| Whole-shift browser GPS | `apps/admin/tests/courier-map.test.mjs` | Immediate first point, 15-second polling after delivery, shared high-accuracy options, permission/general errors, valid sensor payload, non-finite optional sensor values, idempotent cleanup, suppression of late GPS callbacks after end shift, and DELETE ordered after any in-flight final PUT |
| Dispatcher live cache | `apps/admin/tests/courier-map.test.mjs` | A GPS SSE update moves only its courier, preserves every other located/missing courier and an empty post-delivery `activeOrders`, explicit stop produces `OFFLINE`/`null`, unknown couriers require snapshot recovery |
| Web courier isolation | `apps/admin/tests/role-navigation.test.mjs`, `apps/admin/tests/admin-routing.test.mjs` | `/courier` session is allowed only as a dedicated workflow; `COURIER` remains excluded from every admin navigation item |
| Category quick settings | `apps/admin/tests/category-receipt-routes.test.mjs` | Printer update preserves visibility/order, blank IP becomes `null`, visibility toggle preserves printer route |
| LAN validation and UI wiring | `apps/admin/tests/form-schemas.test.mjs`, `apps/admin/tests/receipt-printing.test.mjs` | Private IPv4 validation, stable selectors, quick-settings integration and printer hierarchy copy |
| Catalog deletion UI | `apps/admin/tests/catalog-deletion.test.mjs` | Authenticated DELETE mutations, cache refresh, accessible confirmation, pending and failure states |
| Complete two-courier operations journey | `apps/api/test/operations-journey.e2e.spec.ts` | Successful create/read/update/delete of unused categories and products; parent printer inheritance and child override; two customer orders visible in the administrator kitchen/assignment/delivery/archive queues; packing; distinct courier assignment; separate courier/admin routes; two simultaneous GPS markers; delivery; continued free-courier movement; cash return through reconciliation; historical catalog deletion conflicts; category hiding; explicit end-of-shift cleanup |
| API authorization and public visibility | `apps/api/test/security.e2e.spec.ts` | Forbidden roles, predefined LAN-printer endpoints and editable registry visibility, audited category hiding/deletion, deletion conflicts for order history, public product removal, admin visibility, GPS persistence and a new point after `DELIVERED`, explicit stop sharing |
| Immutable print plan | `apps/api/test/receipt-print-plan.spec.ts` | Main copy, grouping by snapshotted IP, exclusive product/category result and unassigned items |

Required release checks are the root `AGENTS.md` backend and frontend command
sets. API contract changes also require `npm run api:client` before frontend
verification.

## Local two-courier demo

The development-only runner creates two temporary couriers, three real API
orders, assigns two orders to the first courier and one to the second, publishes
their initial GPS points, verifies both OSRM routes and checks that one customer
cannot read another customer's courier location. It refuses to run when the
development OTP code is unavailable.

With local PostgreSQL, Redis, MinIO, TileServer GL, OSRM, API and admin running:

```bash
npm --prefix apps/api run demo:couriers
node apps/api/scripts/local-courier-flow-demo.mjs move
node apps/api/scripts/local-courier-flow-demo.mjs summary
node apps/api/scripts/local-courier-flow-demo.mjs advance 0
```

`move` advances both courier paths and publishes through the authenticated GPS
endpoint. `advance <order-index>` performs the next real courier transition:
`ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED → CASH_RETURNED`. The runner
stores rotating development sessions in a mode-600 temporary file outside the
repository so follow-up commands can refresh expired access tokens without
printing them.

## Manual QA matrix

1. Open `/couriers/map` with at least one free online courier, one busy online
   courier, one busy stale courier, and one courier without GPS. Verify marker
   labels, colors, dashed stale state, overview counts, the missing-GPS warning,
   explicit `Филиал` labels, and no horizontal overflow on desktop and phone.
2. In `Все курьеры`, verify individual markers and colored road routes appear
   by default. Confirm colors match drawer numbers and order labels for 16
   couriers. Toggle routes off/on, select by name or marker, and verify only that
   courier is shown without changing their color. Select couriers with identical
   GPS from the drawer. Expand food/address/comments and return with `Все курьеры`:
   routes must still appear. Check Back/Forward restores selection, drawer Escape returns
   focus to its toggle, and SSE moves GPS without undoing a manual pan/zoom.
3. On that courier's phone open `/courier`, sign in and start the shift. Complete
   the courier's last order. Verify the same marker remains, changes
   to `Свободен`, and moves when the mobile client publishes the next point.
   End the shift explicitly and verify the point disappears.
4. In `/catalog`, set a category printer, hide the category, reload, and show
   it again. Verify the printer address and sort order are preserved and the
   customer catalog hides/shows all products with the category.
   Also verify all six predefined port-9100 endpoints are selectable and that
   changing a temporary apparatus name keeps its IP and existing assignments.
5. Clear the main and category printer with their visible actions. Give one
   product its own IP, then use `Убрать свой IP`; verify it immediately resumes
   category inheritance.
6. Delete an unused dish and an unused category after confirmation. Then try to
   delete a dish and category used by an order; verify the dialog shows the
   conflict and both records remain available to hide.
7. Create one product without an override and one with another private IP.
   Print a mixed order. Verify one complete main receipt, one inherited kitchen
   receipt, and one override kitchen receipt with no duplicate product line.
8. Repeat the affected screens in Chrome, Firefox, and Safari at desktop and
   phone widths. Check keyboard focus, disabled/pending states, console errors,
   marker-label overlap, and long courier/category names.

## External mobile boundary

Android applications are maintained in separate repositories. Their release
is incomplete until the courier client keeps publishing GPS after delivery and
stops only through the explicit end-shift action. The API and admin behavior in
this repository cannot keep a courier visible indefinitely if the mobile app
stops sending points or the operating system suspends background location. The
same-origin `/courier` screen is an immediately available web fallback, but a
native client with approved background-location behavior remains the reliable
choice while a phone is locked.

## Drawer release verification — 2026-09-13

The saved `41c30fb` implementation is integrated with current main. GPS help
now describes the mobile courier application; the website is not required.
Fresh production-build QA passed Chromium, Firefox and WebKit at 1440, 820 and
390 pixels against an isolated real API/database/Redis/OSRM fixture: 16 courier
rows/colors, 15 GPS markers, 11 orders and 7 READY road routes. Selection, drawer
keyboard controls, missing/stale GPS, empty state, denied roles, SSE pan
preservation and exact courier route invalidation passed. Maximum route request
concurrency was three, with no duplicate initial requests.

Admin: 160 tests, lint/build/typecheck and full/production audits passed (zero
vulnerabilities; three pre-existing phone-field lint warnings). No map runtime
errors or horizontal overflow. The existing unavailable local print-agent health
request is recorded separately. Entry gzip grew by 382 bytes; selection took
30–58 ms and Chromium CLS remained below 0.078 in this laboratory run. These are
not production p75 figures or physical-device tests. Evidence and reproducible
runner: `outputs/qa/` in the isolated courier-map release worktree; handoff copy
under `outputs/courier-map-release-20260913/` in the original workspace.
