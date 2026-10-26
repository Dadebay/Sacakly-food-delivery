# A7-tagam durable project context

Update this file whenever an accepted requirement or architectural decision
changes. It is intentionally concise and should be read before every task.

## Product

A7-tagam is a cash-on-delivery food ordering platform for Ashgabat with:

- a NestJS API;
- a pure React/Vite SPA operations admin;
- customer-facing API capabilities for phone login, addresses, catalog,
  ordering, promos, and ratings;
- an admin-visible recent-login list, populated only after a successful OTP
  verification;
- role-specific operations for kitchen, dispatch, courier, cash receipt, and
  accounting.

The NestJS API, React admin, generated OpenAPI contract, deployment manifests,
and CI/CD live in one GitHub monorepo and are changed through the same pull
requests. Separate backend/admin repositories are not parallel sources of
truth. Android applications remain separate because they have an independent
toolchain and release lifecycle.

The React admin is served only by the static Nginx container on the dedicated
VDS. ChatGPT Sites and Cloudflare Workers are not deployment targets. CI/CD
produces immutable API, migration and static Nginx admin images. The accepted
dedicated VDS target is `216.250.12.132` (4 vCPU, 4 GB RAM, 60 GB SSD) and
hosts the only active production stack, including TileServer GL, private OSRM
and Nominatim. There is no deployed DEV environment yet; it will be introduced
later with isolated compute, data, secrets, ports and a separate deployment
policy. Production is served at `https://a7-tagam.com.tm`; Nginx owns ports 80
and 443, with port 80 redirecting to HTTPS, while SSH remains on port 22.

The customer-facing brand is `A7-tagam`. Existing repository, package, service,
deployment-directory, map-style, and storage identifiers named `alowalow`
remain stable technical identifiers for backward compatibility. The admin uses
the supplied hot-food delivery-bag mark and only its cream `#FEF7E7`, navy
`#062F5E`, and orange `#EC7A1B` palette or blends derived from those colors. Courier map
identifiers and routes use distinct operational colors so couriers can be told
apart; their numbers also identify them independently of color.

## Stack and storage

- Node.js 24 LTS with npm 11.6.2, NestJS 11, Prisma 7, PostgreSQL 18.
- Redis 8 for temporary OTP challenges, SMS jobs, and courier GPS.
- A dedicated Android phone with its own SIM is the primary production SMS
  gateway. It pulls encrypted, short-lived OTP jobs from the API over HTTPS and
  acknowledges delivery. It is the only production SMS provider; console is
  development-only.
- Firebase Cloud Messaging is the push transport for customer and courier mobile devices.
  Firebase never owns A7-tagam authentication, OTP, users, roles, or business
  data. A PostgreSQL outbox/inbox records campaigns and delivery results;
  `console` is the non-delivering local provider.
- Private S3-compatible object storage; MinIO locally.
- An independently deployable self-hosted OpenStreetMap base-map service for
  Turkmenistan: Geofabrik Shortbread MBTiles, local VersaTiles assets, and an
  isolated TileServer GL container shared by web and mobile clients. The
  canonical current admin/mobile base-map contract is the simple raster XYZ
  URL `/tile/{z}/{x}/{y}.png`; JSON/MapLibre vector contracts remain optional
  advanced endpoints and are not required by mobile.
- A private OSRM driving engine built from the Turkmenistan OpenStreetMap
  extract. NestJS is its only consumer and exposes normalized, authorized
  courier routes; mobile clients never call OSRM directly.
- A server-side geocoding adapter provides explicit Turkmenistan place search
  and reverse geocoding. The closed-network VDS runs a private Nominatim 5.3
  index from the same Turkmenistan PBF as OSRM; it is Docker-internal and only
  NestJS may call it. Provider origins remain environment-configurable. Local
  workstation development may use public Nominatim with Photon fallback,
  bounded caching, and serialized primary-provider requests. Public Nominatim
  is never used for autocomplete.
- React 19, Vite 8, Swagger/OpenAPI-generated TypeScript schema.
- Local Docker services: PostgreSQL, Redis, MinIO.
- GitHub Actions CI/CD with GHCR API, migration and static admin images.
  `main` is the only deployment branch and automatically deploys immutable
  images to the GitHub `production` Environment and the single production VDS
  after every successful quality gate. DEV infrastructure is deferred and must
  not reuse production data or secrets when it is added.

Durable business data belongs in PostgreSQL. Temporary OTP data belongs in
Redis. Images belong in S3-compatible storage.

## Repository structure

This is the target structure and an architectural contract. When a task adds or
moves a major module, update this tree in the same change.

```text
alowalow/
├── AGENTS.md
├── package.json            # cross-project commands and contract tooling
├── package-lock.json       # root tooling lock
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       └── ci-cd.yml
├── docs/
│   ├── ACCOUNTING_OVERSIGHT_MOBILE.md
│   ├── ACCOUNTING_OVERSIGHT_QA.md
│   ├── ANDROID_SMS_GATEWAY.md
│   ├── ADMIN_TABLET_QA.md
│   ├── ADMIN_ORDER_COMPLETION_QA.md
│   ├── APP_FORCE_UPDATE.md
│   ├── CATALOG_CATEGORY_GROUPING.md
│   ├── COURIER_MAP_AND_PRINTER_ROUTING_QA.md
│   ├── DEPLOYMENT.md
│   ├── INFRASTRUCTURE.md
│   ├── MOBILE_DELIVERY_AND_COURIER_UPDATE.md
│   ├── MOBILE_LOYALTY_DELIVERY_HANDOFF.md
│   ├── MOBILE_MAP_AND_ROUTING.md
│   ├── MOBILE_MULTI_CAFE_CATALOG.md
│   ├── MAP_DELIVERY_ZONES.md
│   ├── NIGHT_DELIVERY_TARIFFS.md
│   ├── MOBILE_TOPIC_BROADCAST.md
│   ├── MOBILE_PUSH_NOTIFICATIONS.md
│   ├── PRODUCT_PRICING_VARIANTS.md
│   ├── RECEIPT_PRINTING_WINDOWS_HANDOFF.md
│   ├── RECEIPT_QUEUE.md
│   └── PROJECT_CONTEXT.md
├── deploy/
│   ├── nginx/
│   │   ├── alowalow-http-temporary.conf
│   │   └── alowalow-production.conf
│   ├── compose.production.yml
│   ├── compose.single-host.yml
│   ├── deploy-production.sh
│   ├── prepare-production-host.sh
│   └── production.env.example
├── maps/
│   ├── compose.yml         # isolated local TileServer GL
│   ├── config.json         # raster/vector endpoints and local assets
│   ├── prepare.sh          # atomic regional data/style preparation
│   └── runtime/            # ignored downloaded MBTiles/fonts/sprites
├── routing/
│   ├── compose.yml         # private local OSRM service
│   ├── prepare.sh          # atomic MLD driving-graph preparation
│   └── runtime/            # ignored OSM PBF and generated route graph
├── apps/
│   ├── api/
│   │   ├── AGENTS.md
│   │   ├── Dockerfile
│   │   ├── package-lock.json # isolated backend dependency/security tree
│   │   ├── prisma/
│   │   │   ├── catalog-seed.ts # validated/idempotent catalog import core
│   │   │   ├── import-catalog-seed.ts # dry-run/apply operational CLI
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── auth/      # OTP, JWT, refresh, Android pull SMS gateway
│   │   │   ├── accounting/ # configurable shifts, cash handoffs, reports
│   │   │   ├── inventory/ # stock items, recipes, lot/location documents, order reservations and audit
│   │   │   ├── users/     # staff, customer addresses and admin page-access policy
│   │   │   ├── branches/  # branch CRUD and nearest-branch selection
│   │   │   ├── delivery/  # welayat/etrap tariffs and delivery pricing
│   │   │   ├── loyalty/   # gift catalog, point wallet and atomic redemption ledger
│   │   │   ├── catalog/   # categories and products
│   │   │   ├── marketing/ # banners and promo codes
│   │   │   ├── media/     # S3-compatible image storage
│   │   │   ├── notifications/ # customer inbox/campaign outbox and direct order pushes
│   │   │   ├── app-versions/ # public mobile update policy and audited administrator settings
│   │   │   ├── orders/    # workflow, assignment, route, rating, cash
│   │   │   ├── tracking/  # courier GPS and dispatch map snapshot
│   │   │   ├── routing/   # validated private OSRM adapter
│   │   │   ├── geocoding/ # provider-swappable OSM search/reverse adapter
│   │   │   ├── common/    # guards, decorators, shared HTTP types
│   │   │   ├── config/    # validated environment configuration
│   │   │   ├── prisma/    # Prisma service/module
│   │   │   ├── redis/     # Redis infrastructure adapter
│   │   │   └── generated/ # generated Prisma client; never edit manually
│   │   └── test/          # unit and isolated HTTP e2e tests
│   ├── print-agent/       # loopback Windows/macOS LAN receipt-print bridge
│   └── admin/
│       ├── AGENTS.md
│       ├── Dockerfile     # static SPA image served by unprivileged Nginx
│       ├── index.html     # Vite browser entry document
│       ├── nginx.conf     # static assets, cache policy, SPA route fallback
│       ├── package-lock.json # isolated frontend dependency/security tree
│       ├── src/            # FSD product layers
│       │   ├── app/        # SPA bootstrap, routes, providers, global styles
│       │   ├── widgets/    # inventory-dashboard, meal/recipe configurator, boards/maps/managers, incl. gift management
│       │   ├── features/   # inventory/page-access/gift actions, notifications, typed mutations and app-version management
│       │   ├── entities/   # typed queries/models, incl. inventory/accounting/delivery/loyalty/page-access/app-version
│       │   └── shared/     # HTTP/query clients, auth, Zod form helpers, UI
│       ├── public/
│       └── tests/
├── packages/
│   └── api-contract/
│       └── src/schema.ts   # generated from apps/api/openapi.json
└── docker-compose.yml      # PostgreSQL, Redis, MinIO for local development
```

Backend modules normally contain a module, controller, service, DTOs, and a
policy file when the domain has authorization or state-transition rules.

Frontend slice internals should use:

```text
slice/
├── api/       # queries and mutations
├── model/     # types, query keys, state, domain helpers
├── ui/        # components and table columns
├── lib/       # private slice helpers when necessary
└── index.ts   # public API for cross-slice imports
```

The allowed frontend dependency direction is:

```text
app → widgets → features → entities → shared
```

Do not expand the current monolithic `app/page.tsx`. Migrate touched behavior
into the target FSD structure. Do not put NestJS business logic in controllers,
Prisma access in React, or duplicate backend policies in client state.

## Roles

- `CUSTOMER`: own addresses, orders, cancellation where allowed, rating.
- `OPERATOR`: monitors orders that enter the kitchen automatically, may create
  a cash order for a caller through the assisted-order API/admin form, and
  assigns or reassigns packed orders to couriers before pickup. The operator
  cannot cancel orders or change their workflow status.
- `COOK`: sees unowned `COOKING` orders and orders already associated with that
  cook for kitchen awareness. The current transition policy grants `COOK` no
  status mutation; packing confirmation is an administrator action.
- `COURIER`: handles only assigned orders, confirms pickup and delivery, and
  confirms collected cash was returned.
- `ACCOUNTANT`: sees the dedicated shift/cash workspace, read-only order details,
  complete operational audit and shift/calendar-month analytics; verifies submitted
  cash packets and performs final reconciliation for every included order.
- `ADMIN`: operational administration, audited correction of active orders,
  backward workflow control before courier pickup, late cancellation before
  cash return, and submission of completed-shift cash to accounting.
- `SUPER_ADMIN`: owner-level administrator with all admin access and protected
  authority over the `SUPER_ADMIN` role.

Only `ADMIN` and `SUPER_ADMIN` may create or retry a customer notification
campaign. `OPERATOR`, `COOK`, `COURIER`, and `ACCOUNTANT` cannot send broadcasts.

Every active authenticated role may quote and create a personal
cash-on-delivery order through the regular order API and may manage its own
saved delivery addresses. The order keeps the account as its `customerId`
without changing the account's role or granting additional operational access.
Only `OPERATOR`, `ADMIN`, and `SUPER_ADMIN` may create a phone-assisted order
for another person; that trusted workflow remains separate from personal
ordering.

Only `SUPER_ADMIN` may manage another `SUPER_ADMIN`, and the system must retain
at least one active `SUPER_ADMIN`.

`SUPER_ADMIN` owns the `/access` role-page matrix. Access is stored by role:
`ADMIN`, `OPERATOR`, `COOK`, `COURIER`, and `ACCOUNTANT` can each be assigned
any of the operations-admin pages, and a change applies to every employee with
that role. A granted page controls both navigation/direct-route entry and the
page's protected API endpoints. The underlying order workflow and entity-level
rules (for example courier ownership and transition rules) remain authoritative
even when the page is granted. `SUPER_ADMIN` always retains every page,
including the courier workspace, and cannot be edited. `CUSTOMER` is a mobile
customer role and is excluded. Stored role policies are versioned for conflict
detection and every successful change creates an audit record. Roles without an
explicit policy retain their safe defaults until `SUPER_ADMIN` customizes them.

The React/Vite operations admin accepts role-page-controlled navigation for
every staff role, including `COURIER`. `CUSTOMER` cannot retain a web session.
A courier whose role has an operations page enters the normal admin shell and
sees only the pages assigned to `COURIER`. A courier role with only
`COURIER_WORKSPACE` continues to land on the isolated `/courier` shift screen,
where GPS and assigned-order behavior remain backend-scoped. The dedicated
screen is a production fallback when a native courier client is not yet
publishing location.

Every operations-admin section owns a canonical browser URL and is composed
through React Router's declarative `BrowserRouter` layout. `/` redirects an
accountant to `/accounting` and administrators to `/orders`; the courier
dispatch map is `/couriers/map`, and the remaining
management sections use their stable top-level paths. Sidebar navigation uses
history-aware links, direct loads are served through the Nginx SPA fallback,
and both menu visibility and direct route entry use the effective server-owned
role-page matrix. A role-forbidden section redirects to that staff role's first
allowed section; if none remain, the admin shows a dedicated no-access state.
Failure to load the matrix closes all admin sections until it can be retried.
Backend endpoint authorization remains authoritative and is not replaced by
page visibility.

The admin order workspace defaults to a role-aware Kanban backed by the same
paginated order API and mutation policy as the table. `ADMIN` and `SUPER_ADMIN`
see two active lanes: kitchen (`COOKING` and `READY`) and courier (assignment
through delivery). Cash-returned, reconciled, and cancelled orders remain in
one collapsed archive. The separate `/accounting` workspace is the only admin
navigation item for `ACCOUNTANT`; it exposes financial summaries, submitted
shift packets, read-only customer/order contents, business audit and shift carryover.
`ADMIN` sees only shift totals and the amount to submit. `SUPER_ADMIN` sees the
complete report, popular-product analytics, and shift settings. Frontend
visibility is usability and data minimization only—the NestJS guards, role
scope, and accounting/order policies remain authoritative.

The compact order summary exposes the next kitchen action: «Проверить готовность
и собрать» or «Назначить курьера». Expanding a card puts the packing checklist
and courier handoff first. Every current item must be checked; changing the
order version resets unsaved checkmarks in both board and table. Only the
authoritative packing response changes the status and unlocks assignment.

## New-order sound alerts — 2026-09-13

The shared admin layout announces newly received kitchen orders with an in-app
notification and one short two-tone chime per received batch. The existing
role-scoped TanStack order query remains the only alert feed: every 30 seconds
while the document is visible, across admin routes. ADMIN and SUPER_ADMIN can
use it in the web portal; ACCOUNTANT and the isolated courier screen do not
mount the alert. No background/closed-tab delivery is promised.

The first successful response is quiet. Backend IDs deduplicate later responses,
and the initial creation-time boundary excludes older orders returning to the
kitchen. The boundary remains fixed to allow concurrent orders that commit out
of creation order. Tracking resets when the signed-in account changes.

Sound is armed by default and unlocked on the first pointer or keyboard action,
as required by browser autoplay rules. Staff can explicitly enable/mute it or
play a test signal. Mute is saved per staff account in this browser; after a
reload, enabled audio still needs a fresh gesture. A single reusable Web Audio
context generates the sound locally, releases nodes after each chime, and closes
on mute/logout. Suspended audio never queues stale sounds for later playback.
Sound does not require browser Notification permission. Optional system notices
use the existing explicit permission button and are silent to avoid a second
OS chime. Visual alerts remain available when sound or system notices are blocked.
Receipt printing continues through its independent durable queue.

The visible receipt-printing EXE consumes that queue directly from NestJS over
HTTPS every three seconds using a dedicated `RECEIPT_AGENT_API_TOKEN`; the site
and browser JWT are not required. It sends the persistent UUID from its local
dispatch journal automatically, renews a three-minute lease every 30 seconds,
and reports the transport outcome. Configuring the key disables legacy browser
claims, preventing two consumers. Lost connections preserve the server task and
stable `dispatchId`; the local journal suppresses duplicate paper after API loss
or EXE restart. Main and kitchen copies remain intentionally separate.

The recipe/stock configurator (`/meal-config`) is an `ADMIN`/`SUPER_ADMIN` only
screen. The separate menu-budget planner has been removed. `/orders/quote`
remains an authoritative, side-effect-free pricing API for customers and
administrators; other staff roles are denied, and promo eligibility uses the
signed-in account. The configurator manages product recipes, ingredient
base units (`GRAM`, `MILLILITER`, `PIECE`), cost per unit, branch stock and
reorder alerts through `/inventory`. `OPERATOR` and `COOK` may read inventory
endpoints for kitchen visibility, while ingredient, recipe and stock mutations
are restricted to `ADMIN`/`SUPER_ADMIN` and create audit records. Stock cannot
become negative, and recipe lines reference active ingredients only.

## Ingredient reservations and inventory — 2026-09-13

Orders continue to enter `COOKING` immediately, with the existing cooking and
packing workflow. No separate kitchen-start action is required. Creating either
customer or assisted orders atomically reserves ingredients from the assigned
branch: recipe quantity × ordered portions ÷ recipe yield. Displayed stock is
availability after reservations. Active product recipes apply to all variants;
products without active recipes use a configured direct stock link, if present,
and otherwise remain orderable without ingredient debits.
A configured recipe with insufficient stock returns `409` and rolls back the
entire order transaction. Ingredient totals use Decimal arithmetic and round
up to the supported 0.001 base-unit precision.

A permitted cancellation in `COOKING`, `READY`, or `ASSIGNED_TO_COURIER`
returns the exact net reservation automatically. This includes the existing
customer 15-minute cancellation window. Assignment alone is not physical
pickup: once the courier advances to `OUT_FOR_DELIVERY`, ingredients are no
longer returned on cancellation, including cancellation from `DELIVERED`.
The canonical decision is in `orders/order-policy.ts`. Existing cancellation
roles, ownership, deadline and terminal-state restrictions remain unchanged.
Cancellation versus courier pickup uses the same order version; only one
concurrent action can commit. Packing, printing and workflow rollback do not
charge ingredients a second time.

Pre-pickup composition or branch edits atomically replace the reservation.
Refund amounts always come from persisted order-linked movements, never from a
changed recipe. New requirements use the current recipe at the time of an edit.
`InventoryAllocatedProduct` records inventory-managed product quantities;
legacy orders have no such records and receive no automatic stock backfill.
Manual and automatic operations share conditional, atomic stock increments
and ordered row locks; concurrent receipts/debits cannot overwrite one another.
Ingredient units cannot change after movement history exists, even at zero stock.

Successful inventory writes and order reservation/return movements share a
transaction with `AuditLog`: actor, database timestamp, reason, ingredient and
branch, movement/order IDs, base unit and exact before/after quantities.
Ingredient and recipe configuration changes preserve complete before/after
snapshots. Concurrent configuration transactions use Serializable isolation and
return a reload/retry `409` on a serialization conflict. No inventory API allows
rewriting or deleting movements or audit records.

Manual adjustments accept an optional UUID `idempotencyKey`, unique per actor.
The administrator UI reuses the same key when retrying unchanged form data.
Duplicate/concurrent requests commit one movement; changing the payload under
an existing key returns `409`. Legacy callers without a key remain compatible
and each request is a separate operation. This does not prevent an authorized
administrator from intentionally submitting another operation under a new key;
such operations are audited independently.

`common/operations-audit.filter.ts` persists rejected inventory/order HTTP
requests outside any rolled-back business transaction, including authentication,
role, validation and stock/version conflicts. It records the verified actor when
available, route template, method, status and socket address, without request
bodies, headers, query strings or secrets. Successful writes fail atomically if
their audit cannot be saved. If the audit database itself is unavailable, rejected
request audit persistence is best effort and emits a sanitized server error.
Physical stock accuracy and actions by a database owner require operational
inventory reconciliation; these application controls do not prove absence of
theft. See [inventory QA and case matrix](../INVENTORY_QA.md).

`/meal-config` (sidebar «Склад и рецептуры») has four focused views selected
by the `view=stock|ingredients|recipes|flow` query parameter. Old
`view=budget` links redirect to `view=stock`. Stock is the
default: branch filter, name search, status count filters and per-position
threshold meters; an empty warehouse explains ingredient → receipt → recipe
setup. Counts represent branch/ingredient positions, never mixed-unit totals.
Ingredients have a searchable list and create/edit dialog. Purchase prices,
minimum balances and manual stock entries use kg, litres or pieces in the UI;
validated form output converts weight/volume to persisted grams/millilitres.
An existing ingredient's unit is immutable in the editor. Receipt/writeoff
shows current and resulting balance, requires a reason, and retains the same
idempotency key for an unchanged retry after a failed/lost response.
The recipe view separates the dish picker from its composition editor and
shows batch/per-portion cost. Quantities remain explicitly in g/ml/pieces for
the entire recipe yield; unsaved edits warn before changing dishes or tabs.
The flow view tracks locations, purchased lots, transfers to the kitchen,
preparation yield, waste and lot-linked inventory documents.
React Hook Form/Zod forms write through the real inventory API. The global
administrator «Склад» button shows the latest 20 decreases from
`GET /inventory/movements`; read markers are local to the browser and staff
account. Inventory notifications are UI-only: no FCM, SMS, browser permission
or operating-system notification is used. The single feed observer and mounted
stock view poll every 15 seconds while the document is visible; leaving the
stock tab unmounts its observer. Mutations invalidate affected stock/feed caches.

## Physical inventory flow and lot trace — 2026-09-30

`Ingredient` is the common stock item for both recipe components and directly
sold goods such as bottled water. A product or variant can have a direct stock
link with quantity per sale; an active product recipe and direct links are
mutually exclusive. A variant link overrides its product-level default.
Order creation reserves the linked stock in the same availability balance as
recipe ingredients. The existing pre-pickup cancellation and edit policies
continue to apply. `InventoryOrderRequirement` snapshots each order item's
ingredient, applied quantity, source (recipe, product or variant), recipe
version and batch yield. Rounding is cumulative at 0.001 per ingredient so
item allocations sum to the branch-level reservation. Later configuration
changes do not alter an existing refund or physical issue.

`IngredientStock.quantity` remains **available to promise**, not a physical
count. `InventoryLotBalance` records physical quantity by lot and branch
location. Stock documents are append-only: receipt, transfer, processing,
waste/spoilage, stocktake, order issue, and legacy adjustment. All user-posted
documents require an administrator role, a reason and an idempotency key;
operator/cook roles can read locations, lots, documents and lot trace. Posting
uses a transaction with conditional nonnegative balances and audit history.
Transfer changes location only, processing consumes input lots and creates new
output lots with explicit measured technological waste, and spoilage is a
separate document against the lot that spoiled. `PROCESS_WASTE` is an
annotation of consumed input material, not a second quantity decrease.
Stocktake records both the expected and counted quantity along with the
unexplained variance until a cause is established. A
processed output lot and all its input lots share one document, so following
lot → process → upstream lot → receipt, or downstream lot → order/waste,
reveals the provenance chain.

Physical order issue is posted exactly once when a courier moves the order
from `ASSIGNED_TO_COURIER` to `OUT_FOR_DELIVERY`, or when an administrator
completes a pre-pickup order through the offline recovery path. It consumes
physical lots FIFO without decreasing available stock again. Early
cancellation returns only the unissued reservation; late cancellation never
recreates physically issued stock. The order version and issue document share
one transaction. A recipe or direct link changed after reservation cannot
change its order-level issued ingredient total.
Lot selection for order issue currently uses FIFO across a branch's locations;
the selected location is an accounting allocation, so a physical pick from a
different place requires a transfer or stocktake correction. The admin list
currently shows the newest 500 lots and 100 documents, while the per-lot trace
includes the full history of that lot.

Existing branch balances have no known historic lots. On first physical
operation the API creates a clearly marked **estimated legacy lot** whose
physical quantity is current availability plus outstanding reservations of
active pre-pickup orders. This is not evidence of a supplier delivery or a
physical count. Administrators should conduct a lot stocktake to confirm it;
the variance is recorded without automatically calling it spoilage. Existing
manual adjustment calls continue to work and now also create lot documents.
New receipts should use a named supplier lot and explicit base-unit quantity.
The initial admin «Партии и цех» form handles one input and one output per
processing document; the API supports multiple inputs and outputs. The current
trace UI follows links one document hop at a time. New order issues connect
each physical lot line to its immutable order-item requirement snapshot;
pre-existing orders without snapshots fall back to order-level totals.
Historical recipe versions before this release are unknown and are not
backfilled.

Research and source comparisons: [inventory flow research](../INVENTORY_FLOW_RESEARCH.md).

## Order state machine

```text
COOKING
→ READY
→ packing confirmed by an administrator
→ ASSIGNED_TO_COURIER
→ OUT_FOR_DELIVERY
→ DELIVERED
→ CASH_RETURNED
→ RECONCILED
```

`CANCELLED` is terminal.

Role ownership:

- customer-app and assisted orders are created directly as `COOKING`;
- a new `COOKING` order is visible to kitchen staff and prints through its
  snapshotted kitchen routes, but printing or viewing it never changes status;
- an `ADMIN` or `SUPER_ADMIN` checks every immutable order line in the assembly
  UI while it is `COOKING`. One optimistic-locked `confirm-packing` mutation
  atomically records the confirmation and moves it to `READY`; generic
  `COOKING → READY` transitions are denied to every role. The endpoint still
  accepts an unconfirmed legacy `READY` order so it can be recovered safely;
- courier assignment is rejected until the packing confirmation exists;
- operator/admin then assigns the packed `READY` order to an active courier and may correct
  that courier while the order remains `ASSIGNED_TO_COURIER`; correction is
  forbidden after `OUT_FOR_DELIVERY` begins;
- assigned courier/admin:
  `ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED → CASH_RETURNED`;
- the assigned courier confirms pickup with
  `PATCH /orders/:id/transition` and `status=OUT_FOR_DELIVERY`, then confirms
  completion through the same endpoint with `status=DELIVERED`; ownership and
  optimistic locking are enforced by the backend;
- the assigned courier/admin moves `DELIVERED → CASH_RETURNED`; this is the
  completed order state, sets `completedAt`, and confirms the cash settlement;
- `SUPER_ADMIN`: emergency individual `CASH_RETURNED → RECONCILED`, unless the
  settlement already belongs to a submitted cash packet; `ACCOUNTANT` and
  `ADMIN` cannot reconcile an individual order;
- `SUPER_ADMIN` inherits admin transitions.

## Administrator recovery for a courier without the app — 2026-09-28

`ADMIN` and `SUPER_ADMIN` can use «Завершить заказ» from both the order board
and table when the real courier left without installing/using the application.
`PATCH /orders/:id/admin-complete` accepts an active unsettled order from
`COOKING` through `DELIVERED`, the current version, a trimmed detailed reason
of 20–500 characters, and `cashReceived=true`. This attests that delivery was
verified and the entire customer total, including delivery, has already been
received and handed to the administrator. The UI states this before submission.
Other roles are denied, and cancelled/completed/reconciled orders cannot be
completed again. The ordinary courier workflow remains compatible.

Keep the real assigned courier. If none is assigned, require an existing active
`COURIER` account; installing the app is not required. Completion cannot replace
an existing assignment and never creates a fictitious courier or staged events.
The transaction directly records the actual prior status → `CASH_RETURNED`,
the complete multiline reason and administrator identity. Missing assignment
and delivery timestamps record the time of administrative confirmation, while
existing timestamps and packing checks remain unchanged. Increment the version
once, confirm exactly one cash settlement and include it in the current shift.
The settlement retains food-only accounting (`total - deliveryFee`); the audit
also records the attested full received total. Award loyalty only when delivery
had not already been recorded. Existing shift-packet reconciliation remains
authoritative. Rejected/stale requests leave all business records unchanged.

## Shift cash handoff and reports

Cash settlement remains order-specific, while delivery to accounting is
grouped by a configurable shift. The singleton schedule uses
`Asia/Ashgabat`: defaults are `09:30–19:00` and `19:00–09:30` on the following
day. Only `SUPER_ADMIN` may change the two names and boundaries. A setting
change never rewrites an already submitted packet because every `CashHandoff`
snapshots its shift name, start, end, expected amount and order count.
The customer and courier still use the complete order total, but the amount
recorded for accounting is only the discounted food subtotal
(`total - deliveryFee`). Delivery is displayed separately and is excluded from
shift handoffs, accounting summaries, daily revenue and the accounting average.
Already submitted handoff snapshots remain unchanged.

After a shift ends, `ADMIN` or `SUPER_ADMIN` submits all unclaimed confirmed
cash settlements whose `operatorTakenAt` falls inside the interval. One unique
`shiftKey` permits only one packet and a serializable transaction claims every
settlement; the administrator may record a different declared amount and note,
but cannot change the backend-calculated expected amount. `ACCOUNTANT` or
`SUPER_ADMIN` confirms the whole packet atomically: all settlements become
`RECONCILED`, all corresponding `CASH_RETURNED` orders become `RECONCILED`,
versions increment, transitions are written, and the cash action is audited.
An individual order attached to a packet cannot bypass packet confirmation.

`/accounting` supports today, seven-day, thirty-day and custom ranges up to one
year. Accountants and super administrators see collected, submitted,
confirmed and outstanding cash, order count/average, cancellations, daily
series and packet history. `ACCOUNTANT` and `SUPER_ADMIN` receive top-product quantity
and revenue analytics. `ADMIN` is denied the financial report endpoint and
sees only the shift amount they must submit. The UI is lazy-loaded and changes
from three summary columns/two shift columns to one column on a phone.

Cancellation:

- a customer may cancel only their own active unsettled order during the first
  15 minutes after its creation; the window is enforced by the backend even
  though every submitted order begins cooking immediately;
- operator cancellation is unavailable;
- `ADMIN`/`SUPER_ADMIN`: any active operational status from `COOKING` through
  `DELIVERED`; cancellation is forbidden once cash was returned or from any
  terminal/accounting status.

Administrators may move an active order one canonical stage backward through
the same transition endpoint: `READY → COOKING` and
`ASSIGNED_TO_COURIER → READY`. Operators never receive backward
transitions. As soon as the courier confirms pickup and the order becomes
`OUT_FOR_DELIVERY`, backward transitions are forbidden for every role; an
administrator may still use the separately authorized cancellation action
through `DELIVERED`. A pre-pickup rollback clears state that no longer applies,
such as courier assignment when returning to `READY`.

Before courier pickup, an administrator may edit the complete business-owned
order content through `PATCH /orders/:id/admin-edit`: add/remove items and
variants, quantities, official map location, address details, delivery etrap,
customer note, and the assigned courier. Backend reprices the active catalog,
existing promo, delivery, total, and nearest branch; client-supplied totals are
never accepted. Changing items after cooking began returns the order to
`COOKING` and clears cook, packing and courier assignment. Identity, order
number/source/payment, accounting records, timestamps, and audit/history remain
system-owned. Every edit is optimistic-locked and audited.

Every mutation uses the order `version` for optimistic concurrency. Status
changes record an order transition; a same-status courier correction records a
dedicated audit event with the previous and new courier IDs.

## Courier behavior

A courier may receive multiple orders simultaneously. Do not enforce a
one-active-order rule. The courier work list contains every assigned active
stop with address, coordinates, customer, item count, and cash amount.
Individual orders progress independently. Do not draw straight lines between
stops and call them routes. The authenticated courier route is built from the
latest fresh Redis GPS point, each unique not-yet-picked-up branch, and every
active delivery stop in assignment order. Private OSRM returns real road geometry,
distance, duration, legs, and maneuvers. If OSRM is down, the API preserves
stops and explicitly reports routing as unavailable.

Both mobile and dispatch use the same backend-owned route contract. `stops`
always contains every active assigned order; `route.nextWaypoints` exposes only
the next one to three actionable pickup/delivery points for concise navigation.
`route.planId` deterministically identifies the ordered inputs and generated
road geometry, allowing admin and mobile to verify that they render the same
plan. An operator/admin may request the selected courier's route through the
role-protected dispatcher endpoint; a courier may request only their own route.
Every fresh courier GPS event invalidates the active dispatcher route, and
clients refresh at the backend's 15-second recommendation so deviation or a
U-turn is recalculated from the latest position.

The current OSM extract/OSRM graph has no live traffic or temporary road-closure
feed. GPS-based recalculation adapts after the courier deviates, but cannot know
about an unreported closure in advance. A future closure capability must ingest
a trusted provider or operator-managed restriction source on the backend and
apply it to routing; clients must not invent independent routes or claim a
live-traffic ETA.

Only the authenticated `COURIER` may publish or delete their own current point.
The latest point is ephemeral operational data in Redis with a 15-minute TTL;
it is `ONLINE` for five minutes, then `STALE` until expiry. The dispatch view is
restricted to `OPERATOR`, `ADMIN`, and `SUPER_ADMIN` and includes each active
courier, latest location, all active assigned orders, delivery coordinates,
customer contact details, items, and cash to collect.

The dispatch map opens in an all-couriers overview with compact numbered GPS
markers matching the drawer rows. Each located courier has an individual marker
at their real GPS coordinates, without clustering. Courier markers, their road
lines and order labels share a distinct color from the full roster; filtering
does not reassign colors or numbers. Couriers at identical coordinates remain
individually selectable in the drawer. Workload and GPS
presence are separate signals. The name menu and `Все курьеры` control switch
between all couriers and exactly one courier; the selection is stored in the URL.
The drawer always lists every active courier, including those without GPS.
Clicking a courier selects their map and expands their orders in place with food,
quantities, pickup branch, destination, entrance/floor/apartment, customer contact,
cash and an explicitly labelled customer comment (or `Без комментария`).
Both the general overview and a selected courier show backend road routes and
delivery labels by default. `Скрыть маршруты` explicitly hides lines; selecting
a courier or returning to `Все курьеры` enables them again. Selecting one
courier filters the others out. Only actual READY road geometry is rendered;
missing/stale GPS and unavailable routing must not produce invented lines. GPS moves markers without
resetting manual pan/zoom. `Вместить в карту` explicitly refits the current scope.
The drawer is collapsible, scrolls independently on desktop and sits below the
map on narrow screens. Enabled visible routes share individual per-courier
TanStack queries between overview and selection. Requests are bounded to three
at a time and settle independently, so a slow/failing route does not hold back
completed lines. SSE invalidates only the changed courier’s route and updates
the single existing dispatch cache.

The previous 120-second courier publish interval plus 30-second admin polling
is only a near-real-time fallback and is no longer the accepted live-tracking
target. During the complete courier shift—including the time between orders and
after an order becomes `DELIVERED`—the mobile client should publish a fresh GPS
reading approximately every 10–15 seconds, adapting to platform background and
battery restrictions. Delivery completion removes the order from
`activeOrders` and changes the map label to `Свободен`; it does not delete the
latest point. Only explicit end-of-shift location deletion stops sharing.
NestJS remains the authenticated ingestion boundary, stores the newest point in
Redis, and pushes each accepted point through the role-protected
`/tracking/dispatch/live` SSE stream. The admin applies those events directly
to the existing TanStack Query snapshot cache. A slower periodic snapshot
remains only for initial state and reconnect recovery.
Couriers use the mobile application and begin sharing GPS there when they start
work. Access to the admin website or its `/courier` page is never a prerequisite
for receiving or displaying mobile GPS. Dispatcher help must describe the mobile
application and its location/network permissions, not instruct couriers to sign
in on the website. The existing browser `/courier` publisher remains a compatible
fallback, not the operational requirement. The dispatcher map states how many
active couriers have coordinates, retains couriers without GPS in the drawer,
and labels branch points as branches. No client may invent a coordinate when
none has been published.
The maintained regression matrix, automated coverage map, and manual QA cases
for courier visibility and printer routing live in
`docs/COURIER_MAP_AND_PRINTER_ROUTING_QA.md`.

The base-map service is independent from courier tracking. It serves only the
public base-map style, vector PBF data, and Leaflet-compatible raster PNG tiles;
it never receives or stores GPS, order, customer, or staff data. Web and mobile
clients render the same base map and overlay their authorized dynamic markers.
OSRM is a separate internal service and receives only the coordinates needed
for an authorized route from NestJS. It is not exposed to mobile/web clients
and never receives customer names, phones, tokens, or order payloads.
Nominatim is another private internal service: it builds the address-search
index from the checked Turkmenistan OSM PBF, receives only search text or map
coordinates from NestJS, and is never exposed through Nginx. The API does not
wait for an unreachable public fallback when this internal origin is selected.

Collection points are active `Branch` records in PostgreSQL, never deployment
environment variables. Each courier order exposes its own branch snapshot, and
the dispatch map shows every active branch plus each order's branch and delivery
coordinates. Admins choose a branch point on an interactive map; clicking or
dragging the marker stores latitude and longitude internally. There are no
manual coordinate inputs: a new branch cannot be saved until staff places its
marker. `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION` are frontend build-time
settings. Local development uses the self-hosted TileServer GL raster endpoint;
deployment must proxy the same endpoint or provide an explicitly configured
compatible provider. New mobile clients use the same service's
`/styles/alowalow/style.json` MapLibre contract. A provider homepage is never
exposed in the branch form or treated as a raster tile endpoint.

The current A7-tagam style is the local VersaTiles Colorful vector style with
local sprites/fonts. Admin courier and branch maps use increased responsive
heights; visual density must not be reduced to the previous pale compact map.

## Customer and payment behavior

- Login/registration is by phone OTP. First and last name are optional.
- Access and rotating refresh tokens both have a 365-day maximum lifetime by
  explicit product decision. Every newly issued access JWT contains a `sid`
  bound to the Argon2-hashed PostgreSQL refresh-session record. Refresh rotation
  and logout revoke that record, so the associated long-lived access JWT is
  rejected immediately; inactive users are still rejected on every request.
  Legacy signed access tokens without `sid` remain accepted only for rollout
  compatibility and retain their originally signed expiry.
- Production OTP SMS is sent by a dedicated Android device. The device polls
  `GET /api/v1/internal/sms-gateway/pull` and acknowledges `SENT`, `DELIVERED`,
  or `FAILED` using the returned lease receipt. Pulling itself refreshes the
  device heartbeat. During the explicitly accepted temporary mobile
  integration window, `heartbeat`, `pull`, and `status` require neither a user
  JWT nor a device token. The existing bearer-device guard remains behind
  `SMS_GATEWAY_AUTH_REQUIRED`; setting it to `true` restores authentication
  without changing the Android queue protocol.
- The API has no global or endpoint request-rate limits, including OTP request
  and verification, SMS gateway polling, tracking, geocoding, delivery quotes,
  and notifications. Repeated OTP sends have no cooldown or hourly limit.
  Each send replaces the previous challenge; only the newest request may
  cancel it. OTP TTL remains 5 minutes with 5 incorrect verification attempts
  per challenge, HMAC protection, and atomic one-time consumption. Invalid or
  unavailable codes still return `401`; request frequency never returns `429`.
- A temporary production test exception may be enabled only for an env-only
  allowlist of up to ten Turkmen phone numbers, with an explicit production
  acknowledgement and an expiry no more than 32 days away. The current
  customer-testing exception covers two accounts through 2026-09-17; phone
  numbers and the code never enter Git or documentation. Each login still
  requires an OTP request, creates a fresh one-time five-minute Redis
  challenge and permits at most five verification attempts. After expiry those
  numbers automatically return to random Android-delivered SMS OTP.
- Outbound SMS jobs are AES-256-GCM encrypted in Redis, expire after the OTP,
  are claimed atomically, and are retried at most three times after missing
  acknowledgements. A final failure cancels only the matching OTP request.
- A user may store up to 100 addresses. Inline checkout reuses an owned address
  with the same address text, coordinates at persisted seven-decimal precision,
  entrance, floor and apartment before checking capacity. Surrounding whitespace
  and empty/null optional details do not create duplicates; the saved label is
  preserved. Changed delivery details remain a separate address. Reuse applies
  to customer-app and phone-assisted orders and keeps the current inline
  delivery quote (including fallback when no etrap is supplied).
- A newly created or selected address becomes active.
- The address used by the latest order becomes the active/default address.
- Delivery tariffs are PostgreSQL configuration keyed by the supplied
  welayat/etrap reference. The initial migration imports 7 welayats and 281
  etraps, enables the 99 Ashgabat entries at the compatible 15 TMT tariff with
  free delivery from 150 TMT, and imports every other region disabled until an
  administrator explicitly enables it. `GET /delivery/config` exposes only
  enabled entries to customer clients; `ADMIN`/`SUPER_ADMIN` manage the full
  directory through the protected admin API and `/delivery` admin screen. The
  admin may create and rename welayats/etraps, maintain English/Russian/Turkmen
  names, ordering and parent-welayat assignment, and configure each etrap's
  price, free-delivery threshold and availability. PostgreSQL allocates new
  numeric IDs. Existing etraps are not deleted because saved addresses and
  historical orders may reference them; disabling hides them from customer
  clients without breaking that history.
- Clients submit `deliveryEtrapId` when the location quote identifies an
  enabled configured tariff zone. The backend rejects a disabled/unknown
  etrap, persists a supplied match on the saved address, computes the current
  fee from database configuration, and snapshots the Russian welayat/etrap
  names plus fee on the order. An address without an unambiguous configured
  match uses the separately configurable fallback tariff, 25 TMT by default and
  free from 150 TMT; the operator does not duplicate the address choice with a
  mandatory manual tariff-zone selection.
- Delivery has independently configurable day and night prices and free-delivery
  thresholds per etrap, plus independent day/night fallback prices. Both
  unmatched-location fallback prices default to 25 TMT. A null
  threshold means that tariff stays paid at every order subtotal. The singleton
  configuration enables/disables night pricing and sets `nightStartsAt` /
  `nightEndsAt` in `HH:mm`, using `Asia/Ashgabat`. The start is inclusive and
  the end exclusive; intervals may cross midnight and equal boundaries are
  rejected. The migration leaves night pricing disabled, copies existing day
  prices/thresholds into the night fields, and offers inactive `23:00–07:00`
  schedule defaults until an administrator configures and enables them.
- Only `ADMIN` / `SUPER_ADMIN` can configure tariffs. Night updates require
  the current configuration/etrap `version`; compare-and-swap updates return
  `409` for stale/concurrent changes and record audit history. Legacy clients
  may still update day-only fields without a version. New etraps inherit their
  own daytime price/threshold as the initial night tariff when omitted.
- The backend chooses the current tariff for location quotes, known-etrap or
  fallback `POST /delivery/tariff-quote`, order quotes, and customer/assisted
  order creation. Clients cannot submit a clock or financial total. Quotes
  expose `tariff`, `timeZone` and `validUntil` so clients can refresh at the next
  boundary. The admin uses server quotes for saved addresses too; it never
  estimates nighttime charges from the daytime config. Receipt totals use the
  saved `deliveryFee`. Creation uses one timestamp for both the tariff and the
  order's `createdAt`; existing orders do not automatically change at a time
  boundary. Explicit administrator edits reprice using the order creation time
  and current configuration, preserving its original day/night time reference.
  Mobile integration: `docs/NIGHT_DELIVERY_TARIFFS.md`.
- `POST /delivery/quote` is the public location-pricing contract. It accepts
  map coordinates plus subtotal, reverse-geocodes the coordinates on the
  server and returns the official address line and configured fee. Delivery
  supports an administrator-controlled transition from legacy text matching to
  polygon pricing. While `mapPricingEnabled=false`, the endpoint proposes an
  enabled etrap only when one multilingual name matches unambiguously.
  Exact normalized name tokens take priority; when no exact token matches, one
  unique alphabetic prefix variant of at least five characters (for example,
  `bitarap` and `bitaraplyk`) may resolve the same configured area. Ambiguous
  prefix matches remain unresolved. Numbered stages and microdistricts match
  only through an explicit number-plus-area expression; a bare house number
  must never select a tariff zone.
  Unknown/ambiguous locations return the authoritative fallback quote with
  `matched=false`; assisted checkout accepts that quote without a second
  district selector. The map coordinates are the source of truth: changing
  the marker triggers a new quote and replaces the visible official-address
  search value and stale tariff selection.
- Every etrap may own one audited polygon of 3–64 ordered latitude/longitude
  points. Administrators draw and inspect these boundaries on `/delivery`,
  alongside the same day/night prices and availability controls. Polygon
  vertices are draggable. An explicit map-assistant action sends one selected
  point through the protected backend to the configured Nominatim provider,
  suggests Russian/Turkmen/English names, and imports an OSM Polygon or the
  clicked part of a MultiPolygon when available. Imported boundaries are
  reduced to the same 64-point contract and remain an editable draft until the
  administrator saves. When OSM returns a usable name but no closed geometry,
  the editor opens an unsaved eight-vertex starter polygon of roughly 800 m
  radius around the selected point. It is explicitly approximate: the
  administrator must reshape its numbered draggable vertices before saving;
  pricing never changes merely because this draft was generated. Missing names
  or invalid geometry create the same editable starter contour while names stay
  available for manual entry. A click near a polygon side inserts a vertex into
  that side; administrators may drag numbered vertices and scale the complete
  polygon inward or outward around its center. The browser never calls
  Nominatim directly. Administrative etrap outlines are not loaded or rendered:
  the map contains only saved tariff polygons and the current draft. The
  admin's primary creation flow starts directly on the
  overview map: an administrator selects a closed mapped district, city or
  other service area (including areas outside Ashgabat such as Arkadag), the
  backend imports its Nominatim polygon, and the price editor opens without a
  manual etrap-selection step. An existing same-name row under the inferred
  welayat is reused to preserve references; otherwise a new tariff-area row is
  prepared with its inferred welayat as a hidden compatibility attribute. The
  daily table lists every street and district, including entries without a
  polygon, with search, prices and editing. A separate map column identifies
  entries without a boundary; only saved polygons appear on the map. Pricing
  settings and the day/night kilometer rates are visible at the top of
  `/delivery`. Administrators choose district/street pricing or kilometer
  pricing explicitly. In kilometer mode the retained map/area fallback
  controls are disabled and labelled as inactive; switching back restores
  their saved configuration. Streets and their labels come from the
  local base map; because a street is a line rather than a closed price area,
  an administrator draws a non-overlapping tariff polygon around the intended
  service area. The map assistant must not import a large administrative etrap
  outline as an inner zone.
  Enabled tariff polygons may share a boundary but must not overlap; malformed,
  zero-area and self-crossing polygons are rejected. Enabling coordinate
  pricing requires at least one enabled valid polygon. Legacy enabled directory
  rows without a polygon remain available for rollback to text mode but are
  ignored by coordinate matching; while map pricing is active, any newly
  enabled zone must have a valid polygon. Once enabled, point-in-polygon lookup
  is the only tariff-zone source for location quotes and final order pricing;
  reverse-geocoded text remains display data for the courier. Coordinates at
  final customer/assisted order creation and administrator editing override a
  stale or manipulated `deliveryEtrapId`, update the saved address reference,
  and use the fallback tariff outside every configured zone. The rollout and
  mobile contract live in `docs/MAP_DELIVERY_ZONES.md`.
- Orders keep immutable snapshots of the address plus product/variant name,
  price, and the effective kitchen receipt-printer endpoint (IPv4 address,
  port and transport) resolved as `product override → category default`.
  Later catalog or printer-registry edits never rewrite
  historical order lines. The only exception is the explicit audited
  administrator edit of an active pre-pickup order; that action intentionally
  replaces its current snapshots and recalculates totals.
- An operator/admin phone order resolves an existing active customer by phone
  or creates a `CUSTOMER` record without issuing OTP, JWT, or refresh tokens.
  A staff phone number or inactive customer is rejected. Staff may reuse one
  of that customer's saved addresses or save a new map-selected address. An
  official result is selected from the accessible search dropdown; the
  unofficial address/landmark is optional. A marker is always sufficient: if
  OSM has no address and the optional landmark is blank, a stable coordinate
  label is stored with the address snapshot. Every such order is marked
  `STAFF_PHONE`, keeps the normal audit trail, prices/promos/branch rules, and
  remains otherwise identical to a customer-app order.
- A new order is assigned inside its creation transaction to the nearest active
  branch by straight-line Haversine distance from the selected delivery address.
- The order stores `branchId`, the computed distance, and an immutable branch
  name/address/coordinate snapshot. Renaming, moving, or disabling a branch
  does not rewrite historical orders.
- If there is no active branch, order creation fails with `409 Conflict`; an
  order is never created without an operational destination.
- Payment method is currently `CASH` only.
- The optional order comment is `customerNote` (up to 500 characters) on
  customer-app and phone-assisted creation. Surrounding whitespace is removed;
  an omitted, null or blank comment is stored as null. This is separate from
  the post-delivery `rating.comment`. Admin creation/editing labels it
  «Комментарий к заказу»; order cards show it before the packing checklist,
  and the table and details display the complete text with line breaks.
  Main and kitchen receipts include the comment and preserve explicit lines.
  Existing administrator pre-pickup editing can replace or clear it. A newly
  requested reprint uses the saved comment; previously queued receipts retain
  their original immutable snapshot, so an edit does not silently change or
  redispatch an old print task.
- The assigned courier, `ADMIN`, or `SUPER_ADMIN` confirms
  `DELIVERED → CASH_RETURNED`; the accountant then reconciles the order as
  part of a submitted shift cash packet.
- Customer may submit one rating/comment after delivery.

## Catalog and marketing

Admins control branches, categories, products, descriptions, active status,
images, banners, and promo codes. `ADMIN` and `SUPER_ADMIN` may permanently
delete a banner record after an explicit admin confirmation. The deletion is
audited and immediately removes the banner from admin and customer lists; its
private S3 image object is retained because media paths may be reused by other
content and storage cleanup is a separate operation. They may also permanently
delete a product that has never appeared in an order, or an unused category
together with all of its products, after a separate confirmation. Catalog
deletion is audited and retains private media objects. A product referenced by
an `OrderItem`, or a category containing such a product, returns `409 Conflict`
and must be hidden instead so historical orders and receipts remain valid.
The catalog editor never asks administrators to enter or understand a technical
slug. NestJS generates a stable unique slug from the category or product name
when a create request omits it; explicit slugs remain optional only for backward
compatibility with existing API clients and seed/import tooling. Renaming an
existing record without an explicit slug preserves its stored identifier.
Branch creation, editing, activation, and
deactivation are limited to `ADMIN` and `SUPER_ADMIN`; trusted operations roles
may list branches. The catalog supports multiple customer-facing cafes (virtual
brands) that operate from the same physical branch network. Every category
belongs to exactly one cafe, every product inherits that cafe through its
category, and cafe/category/product visibility is enforced by the backend.
Cafe records have a name, generated stable slug, optional description and
private S3-backed image, ordering and active state. The migration creates
`Han tagam` plus `Panda` and distributes existing
categories between them in established category order, with a difference of at
most one category. `Han tagam` remains the compatibility default for older
category-creation clients that omit `cafeId`. Administrators may move a
category, together with all of its products, to any cafe from the category
editor.

Public clients first load `GET /catalog/cafes`, then request
`GET /catalog/categories?cafeId=...` (or products with the same filter). Omitting
`cafeId` retains the legacy all-catalog response. One cart/order may combine
products from any number of active cafes: they are prepared at the same assigned
physical location, and the complete order is still routed once to the nearest
active `Branch`. Hiding a cafe removes all of its categories/products from
public catalog, quoting, ordering and new favorites without changing individual
records or historical order snapshots. The operations catalog manages cafes
and their images, then requires a cafe when administrators create or move a
category. Mobile screen behavior and API examples are in
`docs/MOBILE_MULTI_CAFE_CATALOG.md`.
The accepted customer-mobile composition places the delivery address first,
promotional banners second, a horizontal cafe selector third, and the selected
cafe's menu below it. Cafe cards use a restrained warm-yellow/cream treatment
with navy text and an orange selected-state accent; green, neon and
high-saturation styling are explicitly excluded. Switching the cafe changes
the visible menu without clearing the cart.
Images are validated, converted to WebP, and stored privately in S3-compatible
storage. Product availability, current price, promo limits, discount, delivery
fee, final total, and branch assignment are validated by the backend.

A product has an explicit mutually exclusive pricing mode. `FIXED` sells the
dish itself and requires its own price; it cannot contain sellable variants.
`VARIANT` requires a customer-facing selector label, at least one variant and
at least one active variant. Every variant has its own name, optional
description, price, active state, ordering, and up to 10 ordered images. This
supports pizza sizes, fillings and meat-cutting choices without dish-specific
database fields. For `VARIANT`, the public `price` and `minPrice` are the
cheapest active variant price and clients render `от minPrice` until the user
explicitly selects an option. No new client auto-selects the cheapest variant.
`displayImageUrl` prefers that variant's first image and falls back to the
common product image. The complete frontend contract and UI examples live in
`docs/PRODUCT_PRICING_VARIANTS.md`.

Product and variant image references must be private WebP paths returned by the
media API. A product may have up to 10 common ordered images, and every variant
may independently have up to 10. Removed persisted variants are soft-disabled
so historical order references remain valid. The backend enforces the same
common-image limit for the single-image compatibility endpoint.

An administrator maintains an audited receipt-printer registry in PostgreSQL.
Each apparatus has a human-readable name, private LAN IPv4 address, port,
transport (`RAW_TCP` ESC/POS or `JSPEED_HTTP`) and active state. The IP and port
pair is unique. Administrators may create, edit, enable, disable and delete an
unused apparatus; an apparatus referenced by the main setting, a category or a
product returns `409 Conflict` on deletion. Operators may read the registry but
cannot mutate it. An inactive apparatus cannot be newly assigned and an
existing route through it does not produce a print job until it is enabled.
The initial registry contains six discovered active RAW TCP endpoints on port
9100: `192.168.123.100`, `192.168.123.101`, `192.168.123.105`,
`192.168.0.4`, `192.168.0.86`, and `192.168.0.87`. Their temporary names are
`Аппарат 1` through `Аппарат 6`; administrators replace those names in the
registry when the kitchen assignments are known. The idempotent data migration
never overwrites an already managed record with the same IP and port.

An administrator selects a registered apparatus as a category default and may
select a different registered apparatus as an individual-product override. A
product without an override inherits its category route; a product override
always wins and selects one exclusive effective kitchen route, never both.
The catalog workspace exposes all category routes in one quick-settings block,
where each category apparatus can be selected and saved and the complete category can
be hidden, shown, cleared, or permanently deleted without opening the full
category editor. The main printer and every product override also have explicit
clear actions; expanded product tables expose inline override editing, where an
empty product selection resumes category inheritance. Hiding a category
removes it and all of its products from customer ordering without changing the
individual product records; the existing category and product editors remain
available.
The registry, endpoints and effective route are visible only through authenticated
catalog-management responses and are never exposed in the public catalog or
customer order responses. New order lines snapshot the effective kitchen
endpoint so a later catalog or registry edit cannot reroute an existing order.
A separate audited singleton setting selects the main administrator printer; it is resolved
when a print or reprint plan is requested so replacing that physical device does
not require rewriting orders. The intended non-fiscal printer payload
contains the selected product/variant display name, quantity, backend-
snapshotted unit price, and an authoritative order summary with subtotal,
discount when present, delivery fee, configured etrap name when present, and
final total. Fiscalization and returns are outside this requirement; receipt delivery during
connection loss follows the durable queue contract below.

Receipt delivery is persisted in PostgreSQL in the same transaction as customer
or phone-order creation and cancellation. Every task stores a frozen backend
plan and stable dispatch UUID. The operations browser consumes the queue through
leased, authenticated claims instead of observing newly seen order IDs.
Disconnected browsers, agents and printers retain tasks; the next visible tab
resumes definitely unsent work on the original installation.

The plan contains one complete main copy plus kitchen jobs grouped by each
line's snapshotted endpoint. Missing kitchen routes remain visible as unassigned.
Cancellation uses a CANCELLATION document with its stored reason: exactly one
complete main copy, and kitchen cancellation only for transport-confirmed
kitchen portions, at the endpoints recorded in delivered tasks. Unprinted
items are removed from the queue without a kitchen cancellation. The VDS never
connects to private printer IPs; the admin
sends claimed plans to loopback 127.0.0.1:17873 on the printing workstation.

The Go agent persists installation identity and per-copy dispatch results,
returns completed copies without sending again, and stops ambiguous outcomes
for paper inspection. Manual reprint explicitly creates a separate audited
identity. Its table-formatted receipt includes logo, customer/address metadata,
quantities, unit prices and totals without a fixed HALTURIN label. Windows
x86/x64/ARM64 and Mac Intel/Apple Silicon builds share the same source. RAW TCP
and J-Speed HTTP use the registered transport. Main and kitchen copies may
share one endpoint; a 1.5-second RAW cooldown separates copies across orders.
The site and local agent must remain open to consume tasks. Detailed failure,
upgrade and rollback semantics are documented in RECEIPT_QUEUE.md.

The printed receipt uses the agreed A7-TAGAM panda logo and only cafe phones
`530011`, `+99362530011`, and `+99364530011` in its header. The site contact
setting is not repeated there. Both main and kitchen copies show the customer
phone once as `Клиент:`, delivery address/details, order comment and delivery
area; the main copy also shows the customer name as `Имя:`. All comment lines
are preserved. The compact header has an 8-dot top margin and a centred
180-dot logo. The 576-dot renderer retains a 120-dot (15 mm) blank bottom
margin before its final feed/cut. This release includes the previously local
receipt branding/contact fixes so the published agent matches the reviewed
paper preview. Physical Windows printing requires installing the new agent;
a VDS deployment cannot replace a workstation executable.

External catalog seed packages are never executed as supplied. The repository
CLI first performs a non-mutating strict JSON/file-set/WebP validation and only
mutates with an explicit `--apply`. It validates an optional private LAN
receipt-printer IPv4 address per product and optional generic sellable variants,
uploads all validated objects before one serializable PostgreSQL transaction,
upserts by category/product slug and banner media path, synchronizes variants
only when the package explicitly supplies them, preserves existing variants
otherwise, preserves existing images when an imported product has no image,
and records an aggregate audit event. Re-running the same package does not
duplicate catalog rows. An additional explicit
`--replace-catalog` mode soft-disables categories and products missing from the
package in that same transaction, preserving historical order references;
banners are not replaced by this option. Production requires a database backup
before apply; the general development `db:seed` command is not a production
import mechanism.

New order clients always send `variantId` for a `VARIANT` product and omit it
for `FIXED`. For backward compatibility only, omitting it for `VARIANT` selects
the cheapest active variant; an ID belonging to another product, an inactive
variant, or any variant ID supplied for `FIXED` is rejected. A `VARIANT`
product without an active option is excluded from the public catalog. The
selected variant ID, name, unit price, and line total are snapshotted on
`OrderItem`, and its first image is preferred in order responses.

Before creating an order, an authenticated customer may call
`POST /orders/quote` with items, selected `variantId` values, an optional promo
code, and an optional delivery etrap. The endpoint uses the same availability,
variant price, promo schedule/limit, customer-redemption, minimum-order,
discount-cap, and delivery rules as order creation, but creates no order and
does not reserve or consume the promo. It returns each selected dish/variant
with its original unit and line price, a proportional rounded share of the
order-level promo discount, and its discounted line total. The line discounts
sum exactly to the authoritative aggregate discount; the response also returns
the original subtotal, discounted subtotal, delivery fee, and final total.

## Mobile application versions — 2026-09-13

`GET /api/v1/app/version?platform=ANDROID|IOS` is public and available before
login. A configured platform returns exactly `latestVersion`,
`minSupportedVersion`, `storeUrl`, `releaseNotesRu` and `releaseNotesTk`.
Marketing versions use numeric `MAJOR.MINOR.PATCH` without build suffixes;
the minimum cannot exceed the latest version. Responses must not be cached.
An unconfigured platform returns 404; mobile clients continue normally on
any version-check failure. The additive migration creates no initial policies
and never forces an update on deployment. The mobile app owns blocking and
optional-update presentation; this feature does not change API authorization.

`AppVersion` stores one policy per platform, reusing `PushDevicePlatform`.
`ADMIN` and `SUPER_ADMIN` manage policies at `/settings/app-versions`
(«Настройки → Версии приложения»), through `GET /app/admin/versions` and
`PUT /app/admin/versions/:platform`. Other roles are denied. Writes require
the current row version (`0` for first creation), return 409 on stale or
concurrent changes, and atomically audit the actor plus full before/after
policy and acknowledgements. Store URLs must use HTTPS and the platform's
official store: Google Play for `com.gurbanov.alowalow`, or `apps.apple.com`
with a numeric App Store ID. No sample iOS ID or release versions are seeded.

The administrator must confirm the latest release is already available to
all users in the store, with phased rollout finished. This is an audited
human attestation, not automatic verification through store APIs. Raising
the minimum, including initial configuration above `0.0.0`, additionally
requires an explicit blocking confirmation in the UI and API. Lowering the
minimum remains possible for emergency recovery. The form requires separate
configuration per platform and supports nullable RU/TK release notes. See
`docs/APP_FORCE_UPDATE.md` for the mobile contract and release procedure.

## Customer and courier notifications

- An authenticated `CUSTOMER` or `COURIER` registers or refreshes their own FCM registration
  token. The legacy API field is still named `installationId`, but it contains
  the token used by Firebase Admin SDK. The same device may move to a new
  authenticated user after logout/login, but one user cannot
  deactivate another user's device. Other staff roles remain denied, subject
  to the existing global `SUPER_ADMIN` override.
- A successful courier assignment or reassignment sends the new courier a
  direct push: `Täze sargyt #<number>` / `Sargyt size berkidildi.
Jikme-jiklikleri açyň.` This covers both `assign-courier` and a courier change
  through `admin-edit`. Sending starts only after the order transaction commits;
  rejected/stale requests, unchanged couriers and edits that clear the courier
  send no assignment push. Existing customer status notifications are preserved.
- Direct order pushes target only the recipient's active devices while the
  user is active. They are best-effort and do not create campaign/inbox/outbox
  records or retry automatically. Provider failure or missing devices cannot
  undo the order change; invalid tokens are deactivated. Each direct event has
  a fresh `notificationId`, shared across that recipient's devices, so a later
  order is not suppressed as a duplicate. Mobile reloads assigned orders from
  the authorized API; courier inbox/broadcast access is not added.
- Android pushes omit a fixed `channelId` and use each app's manifest default:
  the supplied mobile integration contract names `alowalow_orders` for the
  customer app and `kurier_orders` for the courier app.
- `ADMIN` and `SUPER_ADMIN` create immediate broadcasts to all active customers.
  External URLs are rejected; an optional deep link must be an internal
  application path.
- Every campaign and every customer's inbox item is durable PostgreSQL data.
  Each active device gets a separate delivery record with result/error state.
- Campaign dispatch is a restart-safe database worker with atomic
  `PENDING → SENDING` claiming, stale-work recovery, batches of at most 500 and
  terminal `SENT`, `PARTIAL`, or `FAILED` status. Delivery is at least once;
  mobile clients deduplicate by `notificationId`.
- Customers may list only their own inbox, read their unread count, and mark one
  or all own notifications read. A push permission or network failure does not
  remove the durable inbox item.
- Public announcements use the additional `ALL_APP_INSTALLATIONS` audience and
  the fixed FCM topic `a7-tagam`. The user's explicit topic replaces `hantagam`
  in the supplied mobile note. Customer apps subscribe before login and keep
  that subscription after logout, so guests need no API JWT/PushDevice record.
  Only administrators may create/retry campaigns; there is no public send API.
- Topic campaigns share the durable worker/atomic claim and audit history, but
  bypass customer enumeration, inbox and per-device delivery rows. Provider
  acceptance is recorded in `topicMessageId`; delivery/subscriber counters are
  unknown (`null` in API/UI), never a claimed number of delivered devices.
  Retry/restart can redeliver; mobile deduplicates by stable `campaignId`.
- Topic creation requires a UUID `idempotencyKey`, scoped to the administrator.
  Repeating identical content returns the same campaign; changed content under
  that key returns 409. The UI retains the key across network retries. Retry
  claims are conditional; late worker results cannot overwrite a recovered
  topic dispatch. Full content, actor, target and provider outcome are audited.
- Topic payloads use string data (`campaignId`, optional internal `deepLink`),
  default Android channels and APNs sound. UTF-8 JSON is conservatively limited
  to 2048 bytes before queuing. Topic messages contain no personal inbox ID;
  use only public content. Older mobile builds subscribed solely to `hantagam`
  require an app update; sending to both topics is not an implicit fallback.
  Mobile handoff and phone QA: `docs/MOBILE_TOPIC_BROADCAST.md`.
- Firebase is transport only. A7-tagam phone OTP/JWT stays authoritative, and
  the FCM service account exists only in the backend runtime environment.

## Frontend status and target

Current status:

- the protected admin dashboard has no local demo arrays;
- orders, kitchen workflow, courier assignment, cash workflow, catalog,
  branches, banners, promos, notifications, and staff read/write through the
  NestJS API;
- administrators manage branch addresses and choose branch locations only with
  a map marker in a lazy-loaded FSD screen; the order board can filter by branch
  and shows the assigned distance;
- administrators manage the complete delivery directory on the lazy
  `/delivery` screen: fallback pricing, creation and multilingual editing of
  welayats and etraps, display order, parent assignment, availability,
  delivery price, free-delivery threshold and map polygons. The screen shows
  every configured zone on one map; selecting a polygon opens that zone's
  price/boundary editor. Administrative etrap outlines are hidden; the local
  base map supplies street lines and labels, and the editor provides draggable
  vertices plus whole-contour grow/shrink controls. The
  administrator explicitly activates coordinate-only pricing after at least
  one enabled tariff zone has a valid polygon. The
  phone-assisted order shows
  the location quote and submits an automatically matched etrap when one
  exists; otherwise it uses the configured fallback without asking the
  operator to choose a district manually. The customer-facing endpoint exposes
  the same enabled configuration.
- operators/admins can open a lazy phone-order flow from the order board, find
  a caller by phone, automatically select an exact phone match, prefill the
  active or last-used saved address while still offering every saved address,
  select active catalog items and their configured variants,
  perform a 350 ms debounced OSM address search with an accessible in-flow
  result list, edit an optional courier landmark, or put a draggable marker on
  the map. Search is explicitly choose-then-map: typing never pretends to move
  the marker, selecting a result moves it, and a separate resolved-location
  summary replaces the previous overloaded search/display field. Entrance,
  floor and apartment are grouped as courier details with an explicit notice
  that they do not change geographic coordinates. Editing those details on a
  prefilled saved address keeps its marker but submits the changed details as
  the caller's newly active address instead of silently reusing stale values.
  Enter and the search button bypass the debounce for an immediate request. Its
  desktop dialog uses the wide, near-full-height workspace while phones keep
  the full-screen layout.
  TanStack Query owns all remote data,
  React Hook Form/Zod validate the form, and the backend computes the final
  amount and nearest branch;
- order details show the real status timeline plus the customer's five-star
  rating and comment returned by the API;
- the live order workspace defaults to a responsive Kanban with role-specific
  lanes, card fields, and actions. Operators/admins may switch to the detailed
  TanStack table, cooks work only through kitchen lanes, accountants see the
  complete lifecycle without customer PII, and couriers see all orders assigned
  to them below the GPS-sharing control;
- the dispatch map and courier GPS-sharing screen use Redis-backed tracking;
  accepted locations reach authorized dispatchers immediately through SSE,
  with the 30-second snapshot poll retained only as reconnect recovery. The
  initial map view contains individual markers for every located courier and
  their available road routes in distinct matching colors,
  the drawer distinguishes free/busy work and GPS presence, delivery completion
  preserves shift tracking, and selecting a courier isolates their map and orders. The isolated
  `/courier` web shift screen lets a `COURIER` start whole-shift GPS without
  granting access to the operations admin, while the dispatcher explicitly
  names couriers without GPS and distinguishes branch markers;
- media forms upload validated WebP images to S3-compatible storage;
- banner management supports an explicit-confirmation permanent delete through
  the role-protected API; deletion refreshes the existing TanStack marketing
  cache and retains the underlying private media object;
- catalog management exposes explicit-confirmation permanent deletion for
  unused categories and products, while API conflicts direct staff to hide any
  record protected by order history. Main/category/product printer routes have
  visible clear actions, and a product override retains priority over its
  category default;
- every administrator route supports tablet widths through the shared drawer,
  bounded workspaces, container-responsive tables, coarse-pointer targets and
  a portrait-tablet courier-map stack. Widths through 1180 px always use the
  drawer, touch tablets retain it through 1366 px in landscape, and the sidebar
  owns vertical scrolling at every viewport height. Its explicit close control
  remains pinned while the drawer scrolls and restores focus to the menu
  trigger. The route/API and regression matrix is maintained in
  `docs/ADMIN_TABLET_QA.md`;
- the catalog editor explicitly selects `FIXED` or `VARIANT`. Fixed dishes
  require one price and no variants. Variant dishes require a selector label,
  at least one active option, variant-specific prices, availability, ordering,
  descriptions, and up to 10 S3 images per variant;
- the catalog workspace renders dishes in accessible category accordions with
  first-group, per-group, expand-all and collapse-all controls; search and a
  category filter open their matching groups. The phone-assisted product picker
  provides the same grouped menu plus an explicit category filter and
  name/category search for fast entry of large menus. The
  maintained behavior matrix, edge cases, selectors, and QA checklist live in
  `docs/CATALOG_CATEGORY_GROUPING.md`;
- selecting a searched or reverse-geocoded address in the phone-assisted order
  calls the backend delivery quote. NestJS reverse-geocodes the selected marker,
  updates the separate selected-location summary, calculates the current fee,
  and proposes a delivery etrap only when its multilingual configured name has
  one unambiguous text match. Unknown, numeric-only, or ambiguous locations use
  the configured fallback quote automatically instead of requiring a duplicate
  district choice. Moving the marker clears stale location state before the
  coordinate-keyed quote replaces it;
- administrators see a full pre-pickup order editor from both table and Kanban:
  composition, quantities, catalog additions, address search/map, delivery
  etrap/details, note, and courier. Backend recalculation and audit remain the
  authority. Admin cards also expose one-step rollback and late cancellation;
  operators may assign or reassign a courier before pickup but cannot cancel
  orders or change workflow statuses. The admin rollback action disappears
  after courier pickup, and the backend rejects any attempted backward
  transition from `OUT_FOR_DELIVERY` or `DELIVERED`;
- Swagger response DTOs generate the TypeScript contract used by the frontend;
- TanStack Query owns server state and TanStack Table renders admin lists;
- React Hook Form owns all admin form state and Zod schemas validate values
  before typed API mutations; multipart FormData exists only in the S3 upload
  transport;
- heavy management sections and the Leaflet map are dynamically split.
- the notification manager is a lazy FSD screen; only a pending/sending
  campaign triggers its three-second TanStack Query refresh, and polling stops
  when all visible campaigns are terminal.

Accepted target:

- refactor the admin to FSD layers;
- TanStack Query owns server state and mutations;
- TanStack Table owns admin list/table behavior;
- generated OpenAPI types are the API contract;
- route files remain thin and business behavior moves into entities, features,
  and widgets;
- the admin remains a client-rendered React/Vite SPA with no SSR, hydration,
  React Server Components, or continuously running Node frontend process;
- tables use server pagination/filtering/sorting, and large lists are
  virtualized only after measurement;
- maps, charts, and rarely used management flows are loaded outside the initial
  order-board bundle;
- query freshness, polling, retry, cancellation, and invalidation are defined
  per domain rather than hidden in global defaults.

Never report the admin as fully backend-connected until demo arrays have been
removed and critical workflows pass integration tests against NestJS.

Performance is a release requirement. Production p75 targets are LCP below
2.5 seconds, INP below 200 milliseconds, and CLS below 0.1. Changes to the live
order board, tables, maps, global providers, or API cache must be profiled for
unnecessary rerenders, duplicate requests, waterfalls, polling duplication,
and initial-bundle regression.

The 2026-07-27 tracking build measured the dashboard page chunk at 42.3 KB raw
/ 12.4 KB gzip and the dynamically imported Leaflet map chunk at 156.4 KB raw
/ 45.7 KB gzip. The map chunk was absent from the initial module-preload list.

The 2026-07-28 integrated build keeps the authenticated dashboard shell at
6.9 KB raw / 2.3 KB gzip and splits the order board (6.6 KB / 2.6 KB), catalog
(9.6 KB / 2.5 KB), marketing (11.6 KB / 3.1 KB), staff (5.2 KB / 2.1 KB), and
dispatch view (7.2 KB / 2.5 KB). The Leaflet canvas remains a separate
156.4 KB / 45.7 KB chunk and is absent from the initial module-preload list.
The complete initial preload set, including the former React/vinext framework
runtime, was 335.7 KB raw / 107.5 KB gzip.

The 2026-07-28 order-history/review build keeps the detail request disabled
until an order is opened and adds no dependency or polling loop. The dynamically
loaded order-board chunk is 11.6 KB raw / 3.7 KB gzip; its shared order-domain
chunk is 2.9 KB / 1.3 KB. The Leaflet map remains isolated from both chunks.

The 2026-07-28 multi-image catalog build keeps the authenticated dashboard
shell at 6.9 KB raw / 2.3 KB gzip. The dynamically loaded catalog editor is
11.7 KB / 3.2 KB, plus its existing catalog-mutation chunk at 1.5 KB / 0.6 KB.
The added local form state creates no polling or background request; media
uploads start only when an administrator saves the dish.

The 2026-08-17 variant catalog build keeps both affected workflows lazy. The
catalog editor chunk is 23.6 KB raw / 5.8 KB gzip and the phone-assisted order
chunk is 21.8 KB raw / 6.7 KB gzip. Variant selection reuses the cached catalog
query, adds no polling, and uploads variant images only when the admin saves the
product.

The 2026-08-21 maintained category-grouping build keeps the catalog editor and
phone-assisted workflow lazy at 25.3 KB raw / 6.3 KB gzip and 22.6 KB raw /
6.8 KB gzip respectively, plus a shared 1.0 KB / 0.5 KB grouping/filter helper.
The static SPA bootstrap remains 241.0 KB raw / 77.4 KB gzip; CSS remains
132.3 KB / 26.5 KB gzip. Grouping and category filters are derived from the
existing cached product response and add no request or polling loop.

The 2026-07-30 pure React/Vite migration removes Next.js, vinext, RSC,
hydration, and the Node frontend runtime. The static SPA bootstrap is 199.9 KB
raw / 63.1 KB gzip, with 60.4 KB / 17.0 KB gzip of CSS. Dashboard sections
remain split, and the Leaflet canvas remains a separate 156.4 KB / 46.1 KB
gzip chunk. The server container uses unprivileged Nginx with a 64 MB
production memory limit.

The 2026-08-02 multi-branch build keeps the static SPA bootstrap at 199.9 KB
raw / 63.1 KB gzip. Branch management is a separate 6.2 KB / 2.4 KB gzip
chunk, its location picker is 2.3 KB / 1.1 KB gzip, the order board is 12.9 KB
/ 4.1 KB gzip, and the shared Leaflet canvas remains isolated at 153.3 KB /
44.9 KB gzip. Branch management and Leaflet are absent from the initial
bootstrap and introduce no additional polling loop.

The 2026-08-02 React Hook Form/Zod build keeps the static SPA bootstrap at
200.0 KB raw / 63.1 KB gzip and does not add the form runtime to the initial
module-preload list. The shared form runtime is 99.3 KB / 29.5 KB gzip and is
loaded only when an actual form-bearing flow is opened. Domain form chunks
remain independently split with their existing widgets.

The 2026-08-02 self-hosted OpenStreetMap build changes only the compile-time
tile endpoint. The static SPA bootstrap remains 200.0 KB raw / 63.1 KB gzip,
and the separately loaded Leaflet chunk remains 153.3 KB / 44.9 KB gzip. It
adds no browser dependency, request loop, or initial module preload.

The 2026-08-02 Colorful/height adjustment changes CSS and runtime map assets
only: it adds no frontend dependency, polling loop, or JavaScript to the initial
bundle. Road-route calculation is server-side and does not add admin runtime
code.

The 2026-08-02 authenticated SSE build keeps the static SPA bootstrap unchanged
at 200.0 KB raw / 63.1 KB gzip. The shared courier entity chunk is 2.3 KB /
1.2 KB gzip and the dispatch view is 7.4 KB / 2.6 KB gzip; the separate Leaflet
chunk remains 153.4 KB / 44.9 KB gzip. SSE updates the existing TanStack Query
cache and adds no competing poll or initial preload.

The 2026-08-02 adaptive courier-route build measures the static SPA bootstrap
at 200.0 KB raw / 63.1 KB gzip and CSS at 62.3 KB / 17.4 KB gzip. The dispatch
view is 8.3 KB / 2.9 KB gzip, its lazy courier-map canvas is 3.7 KB / 1.6 KB
gzip, and the shared Leaflet chunk remains isolated at 153.4 KB / 44.9 KB gzip.
GPS SSE invalidates only the selected courier's TanStack route query and adds
no new polling loop or initial preload.

The 2026-08-02 responsive admin build keeps the static SPA bootstrap at
200.0 KB raw / 63.1 KB gzip and the isolated Leaflet chunk at 153.4 KB /
44.9 KB gzip. CSS is 66.8 KB / 18.1 KB gzip, an increase of about 4.5 KB raw /
0.7 KB gzip for responsive data-card, navigation and overflow rules. The order
board remains a separate 13.3 KB / 4.3 KB gzip chunk. No dependency, polling
loop or initial JavaScript was added.

The 2026-08-02 notification build keeps the static SPA bootstrap at 200.0 KB
raw / 63.1 KB gzip and adds the notification manager only as a lazy 8.0 KB /
3.1 KB gzip chunk. CSS is 68.6 KB / 18.4 KB gzip. The screen reuses the existing
form and TanStack chunks, performs no request before an authorized admin opens
it, and polls every three seconds only while a visible campaign is `PENDING` or
`SENDING`; terminal history has no background polling.

The 2026-08-08 assisted-order build measures the static SPA bootstrap at
203.3 KB raw / 63.8 KB gzip and CSS at 87.4 KB / 22.1 KB gzip. The order board
remains a separate 17.3 KB / 5.2 KB gzip chunk. The phone-order flow is loaded
only after an authorized operator opens it (18.8 KB / 5.7 KB gzip); its marker
picker is another 1.3 KB / 0.7 KB gzip chunk and the shared Leaflet runtime
remains isolated at 153.4 KB / 44.9 KB gzip. Address/customer search has no
keystroke autocomplete or polling loop; requests happen only on explicit submit.

The 2026-08-08 A7-tagam brand build keeps the SPA bootstrap at 203.4 KB raw /
63.8 KB gzip. CSS is 93.7 KB raw / 21.1 KB gzip after consolidating every UI
color into three palette tokens and their blends. The in-app/fav icon is a
14 KB WebP; the 940 KB PNG master is reserved for download and social metadata.
No dependency, polling loop, or route preload was added.

The 2026-08-15 assisted-address UX build keeps the static SPA bootstrap at
203.3 KB raw / 63.7 KB gzip. CSS is 97.8 KB / 21.6 KB gzip. The lazy assisted
order chunk is 20.5 KB / 6.2 KB gzip, its map picker is 2.1 KB / 1.1 KB gzip,
and Leaflet remains isolated. The increase covers the accessible listbox,
keyboard handling, explicit map loading state and modal resize correction. It
adds no dependency, keystroke autocomplete, polling loop or initial preload.

The 2026-08-15 Sites retirement keeps the same browser payload: the static SPA
bootstrap is 203.3 KB raw / 63.7 KB gzip and CSS is 97.8 KB / 21.6 KB gzip.
Cloudflare Vite, Wrangler, Worker and platform-specific build output were
removed from the development dependency tree. Vite now emits only
`dist/client`, which the existing unprivileged Nginx image serves with SPA
fallback; no browser runtime or request behavior changed.

The 2026-08-15 role-aware Kanban build keeps the static SPA bootstrap at
203.3 KB raw / 63.7 KB gzip. The lazy order-board chunk is 25.5 KB / 6.8 KB
gzip, an increase of about 5.0 KB raw / 0.6 KB gzip for lanes, role-minimized
cards, view switching, and real workflow actions. CSS is 103.3 KB / 22.4 KB
gzip, an increase of about 5.5 KB raw / 0.8 KB gzip for the responsive
three/two/one-column board. It adds no dependency or polling loop: the active
view keeps one existing 12-second TanStack Query observer, with a server-side
multi-status filter ensuring cook/courier queues are not displaced by history.

The 2026-08-21 compact-order-queue build measures the static SPA bootstrap at
240.9 KB raw / 77.4 KB gzip, the lazy order-board chunk at 56.9 KB / 15.9 KB
gzip, and CSS at 130.1 KB / 26.2 KB gzip. The density change adds no dependency,
request or polling loop. A 50-order visual fixture at 1440 px and 390 px keeps
every active card collapsed at a 79 px summary height, renders only the
virtualized viewport, and has no page-level horizontal overflow. The detailed
table remains a dense table above the phone breakpoint and becomes labelled
cards only at 760 px or below.

The 2026-08-21 fully configurable delivery-directory build measures the static
SPA bootstrap at 241.5 KB raw / 77.6 KB gzip, CSS at 134.5 KB / 26.9 KB gzip,
and the lazy delivery manager at 17.8 KB / 4.5 KB gzip. The phone-assisted
order remains lazy at 23.9 KB / 7.2 KB gzip. The management screen performs no
request before an authorized administrator opens it, uses one TanStack Query
observer, and adds no polling loop or frontend-owned pricing authority.

The 2026-08-21 catalog-accordion/address-tariff build keeps the static SPA
bootstrap at 241.5 KB raw / 77.6 KB gzip and CSS at 136.4 KB / 27.1 KB gzip.
The lazy catalog manager is 26.7 KB / 6.7 KB gzip and mounts product tables only
for expanded groups; the lazy phone-assisted order is 24.6 KB / 7.4 KB gzip.
The address match is a linear projection of the already cached public delivery
config, adds no request or polling loop, and never replaces backend pricing.

The 2026-08-21 location-quote/admin-order-correction build keeps the static SPA
bootstrap at 241.5 KB raw / 77.6 KB gzip and CSS at 136.4 KB / 27.1 KB gzip.
The lazy phone-assisted order is 24.6 KB / 7.3 KB gzip; the lazy full order
editor is 27.8 KB / 9.4 KB gzip and loads only when an administrator opens it.
Location changes use one coordinate/subtotal-keyed TanStack Query with no
polling. The previously widened phone-order dialog remains responsive and
near-full-height on desktop and full-screen on phones.

The 2026-08-21 debounced assisted-address build keeps the static SPA bootstrap
at 241.5 KB raw / 77.6 KB gzip and CSS at 136.8 KB / 27.2 KB gzip. The lazy
phone-assisted order is 25.3 KB / 7.5 KB gzip. Typing issues one cancellable
geocoding query only after a 350 ms quiet period; Enter and the search button
remain immediate, and no polling or eager route load was added.

The 2026-08-22 all-courier/category-printer build measures the static SPA
bootstrap at 241.6 KB raw / 77.6 KB gzip and CSS at 141.2 KB / 27.8 KB gzip.
The lazy dispatcher is 8.9 KB / 3.1 KB gzip, its map canvas is 4.0 KB / 1.7 KB
gzip, their shared pure courier-status helper is 0.7 KB / 0.4 KB gzip, the
catalog manager is 33.7 KB / 8.1 KB gzip, and Leaflet remains isolated at
153.3 KB / 44.9 KB gzip. The overview derives from the existing dispatch
snapshot/SSE cache and the category forms reuse the existing catalog query and
mutation, so no dependency, request stream, polling loop, or initial route
preload was added.

The 2026-08-22 banner-deletion build keeps the static SPA bootstrap at 241.6 KB
raw / 77.6 KB gzip and CSS at 141.5 KB / 27.8 KB gzip. The lazy marketing
manager is 19.1 KB / 4.9 KB gzip; deletion only sends its authenticated mutation
after explicit confirmation and adds no dependency, polling loop, or eager
route load.

The 2026-08-22 tablet-complete build keeps the static SPA bootstrap at 241.6 KB
raw / 77.6 KB gzip. CSS is 142.0 KB / 27.9 KB gzip, an increase of about
0.5 KB raw / 0.1 KB gzip for bounded tablet workspaces, the portrait dispatch
stack and coarse-pointer fields. Route chunks, dependencies, API ownership and
polling behavior are unchanged.

The 2026-08-22 printer-card layout correction keeps the static SPA bootstrap at
241.6 KB raw / 77.6 KB gzip. CSS is 142.9 KB / 28.1 KB gzip; the roughly 0.9 KB
raw / 0.2 KB gzip increase adds padded desktop controls plus 980 px and phone
stacking for the main/category printer panels. It adds no dependency, request,
polling loop or JavaScript to the initial bundle.

The 2026-08-22 assisted-address workflow correction keeps the address search,
Leaflet map and delivery quote inside the existing lazy phone-order chunk. It
replaces the overlay result dropdown with a bounded in-flow list, separates the
search query from the resolved location, and shortens the map to reduce modal
scrolling. The static SPA bootstrap remains 241.6 KB raw / 77.6 KB gzip. CSS is
145.9 KB / 28.3 KB gzip, about 3.0 KB raw / 0.3 KB gzip above the preceding
printer-layout build; the lazy phone-order chunk is 27.5 KB / 8.0 KB gzip, about
2.2 KB raw / 0.5 KB gzip larger for the explicit search/selection/detail
states. It adds no dependency, request, polling loop or initial-route code.

The 2026-08-23 catalog-delete/IP-control build keeps the static SPA bootstrap
at 241.6 KB raw / 77.6 KB gzip. CSS is 146.6 KB / 28.4 KB gzip, and the lazy
catalog manager is 39.6 KB / 9.1 KB gzip. The increase adds inline product IP
controls, explicit main/category/product clear actions, and the accessible
delete confirmation. No dependency, polling loop, or eager route load was
added; all mutations invalidate the existing catalog cache.

The 2026-08-23 courier-visibility build measures the static SPA bootstrap at
242.2 KB raw / 77.7 KB gzip and CSS at 147.8 KB / 28.6 KB gzip. The lazy
dispatcher is 10.0 KB / 3.4 KB gzip, the restored isolated courier screen is
6.3 KB / 2.7 KB gzip, and Leaflet remains separate at 153.3 KB / 44.9 KB gzip.
The change adds one role-gated route and GPS-coverage guidance; it adds no
dependency, poller, SSE stream, or Leaflet preload to the initial document.

The 2026-08-25 assisted-address detail correction keeps the static SPA
bootstrap at 242.2 KB raw / 77.8 KB gzip and CSS at 147.8 KB / 28.6 KB gzip.
The lazy phone-order chunk is 28.1 KB / 8.1 KB gzip and its map picker remains
separate at 2.4 KB / 1.2 KB gzip. The pure selection helper adds no dependency,
request, poller, or eager Leaflet load.

The 2026-08-25 tablet-navigation correction measures the static SPA bootstrap
at 242.9 KB raw / 77.9 KB gzip and CSS at 149.0 KB / 28.9 KB gzip. It adds only
responsive navigation rules, the pinned close control and stable accessibility
hooks: route chunks, dependencies, API requests, polling and cache ownership
are unchanged.

The 2026-08-25 eight-status, two-active-lane workflow keeps the static SPA
bootstrap at 242.8 KB raw / 77.9 KB gzip and CSS at 149.0 KB / 28.9 KB gzip.
It removes obsolete order labels and transitions, keeps the existing single
visible-tab order poll with a smaller two-status kitchen filter, and adds no
dependency, request loop, eager route chunk or client-owned business state.

The 2026-08-25 registered-printer and cancellation-receipt build measures the
static SPA bootstrap at 242.8 KB raw / 77.9 KB gzip and CSS at 151.7 KB /
29.2 KB gzip. The lazy catalog manager is 48.0 KB / 10.5 KB gzip and the lazy
order board is 58.2 KB / 16.3 KB gzip. Printer management reuses the existing
catalog query/cache and cancellation printing adds only its bounded
post-success plan and loopback dispatch; there is no new dependency, poller or
eager route load.

The 2026-09-21 multi-cafe build measures the current static SPA bootstrap at
255.2 KB raw / 81.1 KB gzip, CSS at 209.4 KB / 37.3 KB gzip, and the lazy
catalog manager at 68.4 KB / 15.6 KB gzip. The cafe manager remains inside the
existing lazy catalog route and is absent from the initial HTML preload set.
It reuses the catalog TanStack cache and existing on-demand media upload; cafe
selection/filtering adds no poller, background request loop, dependency, or
client-owned availability/pricing state.

## Decision log

- 2026-09-21: the global customer catalog was partitioned into multiple cafes
  without splitting physical preparation or delivery. Categories now belong to
  one cafe, public/mobile clients can select a cafe before browsing its menu,
  and cafe images use the existing private media pipeline. Mixed-cafe carts and
  orders remain valid and receive one nearest-branch assignment. A hidden cafe
  makes its whole menu unavailable for new quotes/orders/favorites. Existing
  categories are initially divided approximately 50/50 between `Han tagam` and
  `Panda`; administrators can move a category and all of
  its products between cafes. Omitted filters and legacy category creates
  remain backward compatible through the fixed `Han tagam` default. The mobile
  home/catalog layout keeps address and banners above an inline cafe selector;
  cafe cards use a calm warm-yellow/cream palette rather than green or bright
  neon styling.

- 2026-09-19: automatic delivery-area matching ranks candidates by the number
  of matched normalized name tokens before matched character length. A
  one-letter area suffix such as `W`, `A`, or `B` may disambiguate an already
  matched meaningful name but cannot match by itself. Unresolved locations use
  25 TMT as both the day and night fallback price; the independently
  configurable free-delivery thresholds remain unchanged, and existing orders
  keep their snapshotted delivery fee.

- 2026-09-04: the customer removed all API request-rate limits and OTP resend
  cooldown/hourly quotas. The former throttler dependency and decorators are
  removed. Existing Redis rate keys are ignored and expire naturally. OTP
  expiry, five incorrect attempts per challenge, one-time verification,
  request-specific delivery rollback, JWT/RBAC, and validation remain enforced.
  This supersedes rate-limit requirements in earlier decisions below.

- 2026-08-26: order cash reconciliation gained configurable two-shift packets.
  Administrators submit one completed-shift handoff, accountants confirm it
  atomically, and super administrators manage the schedule and see complete
  financial/product analytics. The accountant admin was reduced to the single
  `/accounting` view; admin reconciliation of individual orders was removed.
  The responsive dashboard remains a lazy 14.9 KB / 4.4 KB gzip route, while
  the shared entry stays 243.4 KB / 78.0 KB gzip; it adds no dependency or
  application-wide polling owner.
- 2026-07-27: media moved to private S3-compatible storage.
- 2026-07-27: OTP moved from PostgreSQL to atomic Redis storage; an initial
  third-party SMS adapter was added and later removed after the Android gateway
  became the sole production provider.
- 2026-07-27: multiple saved addresses added; last created/used address becomes
  active.
- 2026-07-27: `SUPER_ADMIN` added with protected owner-level authority.
- 2026-07-27: frontend target set to FSD + TanStack Query + TanStack Table,
  based on lessons from the NEM app without copying its older dependency
  versions or mobile-only persistence.
- 2026-07-27: frontend performance became an explicit release contract;
  optimize with measured React/TanStack techniques instead of blanket
  memoization.
- 2026-07-27: courier GPS updates were set to a two-minute client interval;
  latest points live in Redis, dispatch access is limited to trusted operations
  roles, and the first real FSD/TanStack frontend slices were introduced for
  courier tracking and the map.
- 2026-07-28: the demo admin was replaced with a protected, backend-integrated
  FSD dashboard for orders, kitchen, dispatch map, catalog/S3 media, banners,
  promos, staff, and cash reconciliation. A secured staff-creation endpoint was
  added, Swagger response contracts became explicit, and browser CORS now
  permits courier GPS `PUT` requests.
- 2026-07-28: product media was formalized as an ordered set of up to 10 private
  S3-backed WebP images, with the first image acting as the primary catalog
  image and matching validation in the API and admin.
- 2026-07-28: CI/CD was defined as deny-on-failure GitHub Actions checks,
  Swagger contract drift detection, immutable GHCR API/migration images with
  provenance and SBOM, and an optional protected-environment Linux deployment.
  The static Nginx admin image is deployed with the same VDS release.
- 2026-07-28: production OTP delivery moved to a dedicated Android SIM gateway
  using authenticated HTTPS pull, encrypted Redis jobs, atomic leases,
  delivery receipts, heartbeat/offline rejection, bounded retry, and
  request-specific OTP cancellation.
- 2026-07-29: branch-based backend delivery was defined as
  `develop → development` and `main → production`, using isolated server
  directories, Compose projects, ports, databases, Redis, S3, secrets, GitHub
  Environments, pre-deploy migrations, health checks, and digest rollback.
- 2026-07-29: Ayterek (`map.ayterek.com`) was considered as the production map
  provider. Its public page URL is not a tile endpoint and remains unused until
  an official raster tile or MapLibre style contract is supplied.
- 2026-08-02: local development moved to a self-hosted OpenStreetMap base map.
  A separate hardened TileServer GL container renders Leaflet-compatible PNG
  tiles from the daily Turkmenistan Shortbread MBTiles extract with local
  VersaTiles style, sprites, and fonts. It has no runtime dependency on public
  OSM tile servers and does not include geocoding or route planning.
- 2026-08-02: the self-hosted base map became an independently deployable
  shared web/mobile service. MapLibre vector style is the preferred mobile
  contract and PNG remains a Leaflet compatibility output of the same server.
  Courier GPS continues to enter only through the authenticated API; true live
  dispatch requires 10–15-second active-delivery publishing and server-pushed
  authorized marker updates. Straight-line pseudo-routes were removed.
- 2026-08-02: courier route planning became an accepted backend capability.
  A private, digest-pinned OSRM MLD service builds routes from the same regional
  OpenStreetMap source; NestJS combines current courier GPS, unique branch
  pickups, and every assigned delivery, then returns normalized GeoJSON,
  distance, duration, legs, and maneuvers. Clients never access OSRM directly,
  and assigned stops remain visible if routing is unavailable. The shared map
  style moved from pale Neutrino to local VersaTiles Colorful and map canvases
  received larger responsive heights.
- 2026-08-02: live dispatch moved from polling-only updates to an authenticated
  SSE stream. Courier GPS still enters through the role-protected NestJS
  endpoint and Redis remains the latest-point store; accepted/stopped location
  events contain only courier ID and GPS data and update the existing TanStack
  Query snapshot cache. Active-delivery clients now receive a 15-second update
  recommendation; periodic polling remains a recovery path, not a second
  competing live-state owner.
- 2026-08-02: courier and dispatch route views converged on one authoritative
  response. Every active order remains in `stops`, the next three operational
  waypoints are exposed separately, and a deterministic `planId` identifies the
  shared road geometry. Fresh GPS invalidates the selected admin route for
  15-second adaptive recalculation. The self-hosted OSRM graph does not provide
  live closures/traffic; integrating a trusted dynamic-restriction source is a
  separate future backend capability.
- 2026-08-02: branch management gained a lazy-loaded interactive location
  picker. A map click or marker drag stores validated latitude/longitude at the
  persisted seven-decimal precision. Manual coordinate inputs and the provider
  homepage link are intentionally absent from the branch form; only the direct
  tile template and its attribution are build-time settings.
- 2026-08-02: every React admin form standardized on React Hook Form with
  colocated Zod schemas and shared validation helpers. Zod handles input
  normalization and client feedback, while NestJS remains authoritative for
  permissions and business invariants. Multipart FormData is limited to the S3
  image upload transport.
- 2026-07-29: API and admin were physically consolidated under `apps/`, with
  generated Swagger types in `packages/api-contract`, one Docker/CI/CD flow,
  and one GitHub pull-request lifecycle. API and admin intentionally retain
  independent npm lockfiles so security overrides, audits, and Docker builds
  stay isolated and reproducible.
  The canonical repository is `Guvanch99/alowalow`; the old admin repository
  is archived after the monorepo push is verified. Android stays separate.
- 2026-07-30: the first accepted target was a shared Ubuntu host. That plan used
  HTTPS port `8443`, loopback ports `3001`/`4001`, and an isolated
  `/opt/alowalow/development` directory. It was superseded on 2026-08-14 before
  the application was deployed there; the other project and its ports were not
  changed.
- 2026-07-30: the admin deployment was corrected to pure React/Vite SPA.
  Next.js, vinext, React Server Components, SSR, hydration, and the Node
  frontend server were removed. Browser routes use Nginx static index fallback.
- 2026-08-02: the unused Twilio fallback and its credentials were removed.
  Production OTP delivery is Android pull only; local development keeps the
  non-delivering console mode.
- 2026-08-06: a single-device LAN development mode may use the Android pull
  gateway without a bearer token when `SMS_GATEWAY_ALLOW_UNAUTHENTICATED_LOCAL`
  is explicitly enabled. The flag is rejected outside development. This local
  exception was later supplemented by the explicitly accepted temporary
  production integration mode documented on 2026-08-19.
- 2026-08-02: multi-branch operations replaced the deployment-level dispatch
  configuration. Admins manage PostgreSQL-backed branches, every new order is
  routed to the nearest active branch and stores an immutable branch snapshot,
  order lists can filter by branch, and dispatch maps show all branch
  points. The global catalog remains shared across branches. No active branch
  is a fail-closed `409` condition.
- 2026-08-02: admin data lists gained one shared responsive TanStack Table
  presentation. Order rows switch to labelled two-column cards on constrained
  operations screens, all tables switch to one-column cards on phones, and
  catalogue/marketing tables use full-width sections. Mobile navigation uses
  a fixed three-column grid and cash-status tabs stack vertically, so neither
  requires a nested horizontal scrollbar.
- 2026-08-02: customer push notifications became a durable backend capability.
  `ADMIN`/`SUPER_ADMIN` create immediate all-customer campaigns, PostgreSQL
  stores customer inbox and per-device delivery results, and a restart-safe
  worker sends through FCM in batches. Mobile devices register current FCM
  registration tokens against the existing customer JWT; Firebase Auth is not
  used. The lazy FSD admin screen uses the generated Swagger contract and polls
  only while a visible campaign is pending or sending.
- 2026-08-08: operator-assisted phone orders became a first-class API and lazy
  admin workflow. `OPERATOR`/`ADMIN` may resolve or create a caller by phone
  without issuing a session, choose dishes and a saved/new address, and submit
  a `STAFF_PHONE` cash order through the same backend pricing, promo, nearest
  branch, address activation, immutable snapshots, and audit logic used by the
  customer flow. Address lookup is explicit-submit server-side geocoding with
  a manual unofficial-landmark and draggable-map fallback; public Nominatim is
  rate-limited/cached and its endpoints are replaceable through environment.
- 2026-08-15: the closed-network DEV address search moved to a private pinned
  Nominatim 5.3 container using the existing Turkmenistan PBF and a persistent
  PostgreSQL index volume. The assisted-order search now renders an accessible
  keyboard-selectable dropdown, the map invalidates its size inside the modal,
  and the manual unofficial landmark is optional because an exact marker can
  provide the persisted coordinate fallback.
- 2026-08-08: the customer-facing brand changed to `A7-tagam`. The React admin
  uses the supplied hot-food delivery-bag logo for login, navigation, courier,
  favicon, and social metadata. Its visual system is restricted to the logo's
  cream, navy, and orange palette plus blends derived only from those colors;
  stable technical identifiers named `alowalow` remain unchanged.
- 2026-08-14: DEV moved to the dedicated VDS `216.250.12.132` with 4 vCPU,
  4 GB RAM and 60 GB SSD. One full stack runs under the isolated Compose project
  and directory `/opt/alowalow/development`: API, static admin, PostgreSQL,
  TLS-Redis, MinIO, TileServer GL and private OSRM. Nginx owns standard ports
  `80`/`443`; application and tile
  upstreams remain loopback-only and OSRM remains Docker-internal. A 2 GB swap
  is recommended for image updates and map-rendering peaks. Production remains
  disabled and requires a separate host or explicit capacity/security review.
- 2026-08-14: the VDS egress audit found Ubuntu APT, GitHub, GHCR and Telecom
  Nexus available, while public Docker Hub, PyPI and Snap CDN are unreachable.
  Pinned third-party images retain their source digest and are pulled through
  the anonymous `nexus.telecom.tm` Docker proxy; the available npm proxy is not
  needed because no Node build runs on the server. Repository-owned images use
  a job-scoped `GITHUB_TOKEN` for SSH-stdin Docker login followed by logout, so
  no persistent registry token or server VPN is required. Certbot 5.7 runs from
  an isolated offline wheel installation under `/opt/alowalow/tools`.
- 2026-08-14: because the VDS cannot reach the Let's Encrypt ACME API, IP
  certificate issuance and renewal run outside the server. A pinned Certbot
  client in GitHub Actions uses validated SSH auth/cleanup hooks to publish only
  the HTTP-01 token, keeps canonical ACME account/certificate state under
  `/opt/alowalow/acme-state`, and checks every 12 hours. Nginx reloads only
  after the renewed state is transferred and its configuration passes.
- 2026-08-15: the pinned Redis image is forced to its upstream non-root
  `999:1000` identity. This lets Redis traverse the host TLS directory through
  its numeric group while `cap_drop: ALL`, the directory's `750` mode and the
  host-only CA key remain intact. Host preparation also persists Redis's
  recommended `vm.overcommit_memory=1` sysctl.
- 2026-08-15: two Let's Encrypt staging attempts reached the VDS successfully
  from two and then three validation perspectives, while one secondary
  perspective consistently received `connection refused`. Trusted IP HTTPS is
  therefore not marked ready: the HTTP-only ACME bootstrap stays active and
  scheduled renewal stays gated off until Telecom fixes international port-80
  reachability and the first production certificate is installed.
- 2026-08-15: the temporary release flow was simplified for the initial
  customer-testing period. `main` is the only active integration branch and
  deploys production-mode images to the single `development` VDS after every
  successful quality gate. No separate `develop` or staging environment is
  maintained yet. When a second server is provisioned, branch/environment
  separation must be introduced explicitly before production launch.
- 2026-08-15: GitHub-hosted runners cannot reach the VDS SSH service through
  Telecom on port `22`, while the server must remain VPN-free. The same hardened
  sshd therefore listens temporarily on both `22` and `443`; deploy jobs use a
  validated `DEPLOY_SSH_PORT=443`, short connection timeouts, the verified host
  key and the job-scoped GHCR token. Port `443` must be returned to Nginx and
  the deploy transport reviewed before trusted public HTTPS is enabled.
- 2026-08-15: the ordered canonical origin is
  `https://a7-tagam.com.tm`. Turkmen Telecom, not Let’s Encrypt, supplies and
  renews its SSL certificate for the domestic-only service. Nginx serves the
  React admin at `/`, NestJS and media at `/api/v1`, Swagger at `/docs`, and the
  shared map at `/tiles`; private OSRM remains backend-only. The repository
  prepares conventional certificate paths under
  `/etc/nginx/ssl/a7-tagam.com.tm`, but activation waits for Telecom’s actual
  certificate paths and renewal ownership. The previous ACME workflow remains
  disabled.
- 2026-08-15: access and refresh lifetimes were set to 365 days by explicit
  product decision. Newly issued access JWTs are session-bound with `sid`; the
  guard checks the current active user and unrevoked, unexpired PostgreSQL
  session on every protected request. Refresh rotation or logout therefore
  invalidates the related year-long access token immediately.
- 2026-08-15: while Turkmen Telecom prepares DNS and SSL for
  `a7-tagam.com.tm`, the customer explicitly authorized temporary plain HTTP
  access on `216.250.12.132` for domestic testing. The temporary Nginx gateway
  proxies the admin, API, Swagger and tiles through one origin and advertises
  `X-A7-Temporary-HTTP: true`. It is an accepted short-lived exception only:
  browser geolocation is unavailable and credentials are not transport-secure.
  HTTP and HTTPS configurations remain versioned side by side, with exactly one
  site enabled at a time. The temporary Swagger location preserves Helmet's CSP
  except for `upgrade-insecure-requests`, which would otherwise upgrade its
  assets before TLS exists and render a blank page. Telecom also resets plain
  HTTP asset requests whose path contains the literal word `runtime`, so the
  Vite production build emits opaque `chunk-<hash>.js` filenames. Admin API and
  map URLs stay relative (`/api/v1` and `/tiles`), allowing the exact build to
  move from the temporary HTTP origin to the final HTTPS origin. Nginx rewrites
  TileServer-generated `localhost` references inside JSON map contracts to the
  current same-origin `/tiles` base; binary raster/vector tile payloads remain
  untouched. The temporary site must be removed and port 80 redirected to
  HTTPS as part of Telecom certificate activation.
- 2026-08-15: the customer explicitly requested a reusable one-year test OTP
  for one admin phone during customer testing. The exception is server-env
  configured, expires within 366 days, is allowed only when
  `DEPLOYMENT_ENVIRONMENT=development`, and never bypasses request throttling or
  the fresh one-time 5-minute Redis challenge. Production deployment validation
  rejects the exception; every other number continues through Android SMS.
- 2026-08-15: ChatGPT Sites was retired as an admin deployment target by
  explicit product decision. Its repository binding, Cloudflare Worker,
  Wrangler dependencies and CI artifact metadata were removed. The admin is a
  static React/Vite SPA deployed only as the Nginx image in the VDS release;
  no Sites project may be created, updated or published without a new explicit
  product decision.
- 2026-08-15: the deployed topology, GitHub Environment settings, secret
  boundaries, public URLs, persistent data, release flow, recovery commands and
  production-readiness gaps were consolidated in `docs/INFRASTRUCTURE.md`.
  Infrastructure tasks must update that inventory without recording secret
  values; `README.md` was corrected to the then-active
  `main → development VDS` flow.
- 2026-08-15: the customer superseded the temporary DEV-labelled deployment
  decision. `main` is now the only active branch and deploys directly to the
  GitHub `production` Environment and `/opt/alowalow/production` Compose stack.
  The active runtime uses `DEPLOYMENT_ENVIRONMENT=production`, production image
  tags, ports `4000`/`3000`, and no long-lived OTP exception. A future DEV must
  be built as separate infrastructure with its own environment, directory,
  Compose project, ports, data and secrets; it is not active now.
- 2026-08-15: the customer selected a single raster XYZ base-map contract for
  both the Leaflet admin and mobile applications:
  `/tile/{z}/{x}/{y}.png`. Host Nginx maps it to the private TileServer GL
  `alowalow` PNG style backed by the Turkmenistan-only extract. Mobile does not
  need `style.json`; JSON/vector endpoints remain optional and backward
  compatible. Courier/order/GPS data and OSRM routes still come only from the
  authenticated NestJS API and are rendered above the raster background.
- 2026-08-15: order operations gained a role-aware Kanban as the default view.
  Operator/accountant/admin roles can observe the whole lifecycle, cooks and
  couriers receive only their operational lanes, and order cards minimize
  unrelated personal and financial fields by role. Operator/admin roles retain
  the detailed table switch; the courier screen combines GPS sharing with every
  backend-scoped assigned order. All actions reuse the versioned NestJS order
  mutations, while backend guards remain authoritative. The order list gained
  a backward-compatible validated `statuses` query for one-request role queues.
  Search and role constraints are composed with `AND`, preventing a cook search
  from overriding the server visibility scope.
- 2026-08-18: customer testing gained a narrowly scoped production OTP
  exception for two env-only allowlisted numbers through 2026-09-17. The
  reusable value is never committed, production requires an explicit
  acknowledgement, the expiry is capped at 32 days, and every use retains the
  normal request cooldown, hourly limit, five-minute Redis challenge,
  five-attempt limit and one-time consumption. After expiry, Android SMS is
  automatically authoritative again. Because the hardened host no longer
  accepts its bootstrap password, the three temporary values are delivered by
  the existing protected GitHub `production` deploy key from encrypted
  Environment secrets into the mode-600 VDS env; the workflow never prints or
  includes them in images. The originally planned 2026-09-18 expiry was moved
  one day earlier after the VDS was found approximately two days behind with
  NTP enabled but unsynchronized; the shorter date preserves the production
  32-day safety cap until Telecom-reachable time synchronization is fixed.
- 2026-08-18: external catalog seed import gained a repository-owned strict
  dry-run/apply CLI. It validates the complete JSON and referenced WebP set,
  uploads S3 objects before a serializable idempotent database transaction,
  preserves existing variants, records an audit event, and requires a
  production backup. The initial package's old visible `AlowAlow` brand is
  normalized to `A7-tagam`; placeholder banner text and foreign/test links are
  removed instead of publishing them.
- 2026-08-19: at the customer's explicit request, the Android SMS gateway's
  `heartbeat`, `pull`, and delivery-status endpoints temporarily became
  tokenless in production to unblock the single-phone integration.
  `SMS_GATEWAY_AUTH_REQUIRED=false` is the current default, Swagger no longer
  advertises a device bearer requirement, and user access/refresh JWTs are not
  involved. The existing constant-time bearer guard and device secret remain
  ready; changing the flag to `true` restores the protection without an API
  payload change. This accepted exception exposes OTP jobs and their status
  mutation to every client with network access and must be removed after the
  mobile integration is complete.
- 2026-08-19: the Telecom-issued Sectigo certificate for `a7-tagam.com.tm` and
  `www.a7-tagam.com.tm` was validated against its CA bundle and matching private
  key, then activated on the production VDS. Nginx now owns 443 and serves the
  admin, API, Swagger and map through one HTTPS origin; port 80 permanently
  redirects to it. SSH returned to port 22 only, and GitHub deployment metadata
  was updated accordingly. The certificate expires on 2027-03-05; Telecom owns
  renewal issuance and A7-tagam operations owns validation/installation. During
  activation, Chrony reported a valid reference while the system clock was
  120,495 seconds slow; the clock and RTC were stepped to the trusted NTP time
  before TLS verification. GitHub-hosted runners still cannot reach domestic
  SSH port 22, so unattended deploy requires a domestic self-hosted runner or
  another Telecom-approved transport and must never reclaim HTTPS port 443.
- 2026-08-20: the operations admin gained one global, role-scoped new-order
  alert loop for `OPERATOR`, `ADMIN`, and `SUPER_ADMIN`. It polls the real
  active kitchen/ready order queue every 30 seconds only while the document is visible,
  establishes the first response as a quiet baseline, deduplicates by backend
  order ID, always shows an in-app alert, and optionally uses the browser
  Notification API after an explicit user gesture. Existing order-board polling
  uses the same 30-second cadence. Tablet and phone navigation converged on one
  off-canvas drawer through 1180 px, hidden drawers cannot intercept taps, and
  coarse-pointer controls have a minimum 44 px touch target.
- 2026-08-20: new customer-app and phone-assisted orders began entering the
  kitchen queue immediately, with direct kitchen-to-ready support and no
  confirm/handoff buttons in the normal admin flow. Newly observed kitchen
  orders dispatch their receipt plan automatically from the operations
  workstation, and every printed chunk includes the online order number. A
  persisted, audited administrator packing confirmation—backed by an all-lines
  checklist—is now required before courier assignment.
- 2026-08-20: the order board was condensed from status-by-status columns to
  grouped operational columns plus one collapsed
  archive. Individual cards are expandable and every lane uses TanStack Virtual
  with stable backend order IDs and dynamic measurement, so queues of 50–100
  orders do not mount every detailed card. The board and table default to the
  current local calendar day, allow yesterday, an explicit historical date, or
  all history, and support an hour range within the selected day. NestJS owns
  the inclusive `createdFrom` and exclusive `createdTo` filtering and composes
  it with role, status, branch, and search constraints.
- 2026-08-20: the operations admin replaced local-state tab switching with
  canonical React Router browser routes. `/` redirects to `/orders`; every
  management section supports direct loading, bookmarkable URLs and browser
  back/forward navigation, while the shared authenticated layout and
  role-scoped sidebar remain mounted. Direct access to a role-forbidden section
  redirects to the role's default allowed route, and Nginx continues to serve
  all browser routes through the static SPA entry document.
- 2026-08-21: the controlled catalog importer gained per-product private LAN
  receipt-printer routing, optional variant synchronization, and an explicit
  atomic replacement mode. Replacement soft-disables unlisted
  products/categories instead of deleting rows, so old order references remain
  valid; banners are unchanged and production still requires a verified backup
  plus dry-run before apply.
- 2026-08-21: the order workspace stopped auto-expanding active orders. Every
  virtualized Kanban card now starts as a compact summary and exposes its full
  workflow only on demand; the detailed order table retains dense desktop and
  laptop rows instead of turning them into large cards before the 760 px phone
  breakpoint.
- 2026-08-21: catalog products became category-grouped in both the catalog
  workspace and the phone-assisted order picker. The picker also exposes
  category chips with counts while preserving text search and variant
  selection, so operators can navigate large menus without scanning one flat
  list.
- 2026-08-21: category grouping and both workflow-specific filters moved into
  shared pure catalog-model functions. Fifteen focused tests now cover normal,
  empty, hidden, malformed, combined-filter, punctuation, variant/printer, and
  1,000-product cases; `docs/CATALOG_CATEGORY_GROUPING.md` is the maintenance
  behavior matrix and manual QA contract.
- 2026-08-21: delivery pricing moved from the fixed `15 TMT` / free-from-150
  expression into audited PostgreSQL configuration by welayat and etrap. The
  supplied 7/281 reference was imported, Ashgabat starts enabled, other regions
  start disabled, public clients receive enabled tariffs, old clients use an
  admin-configurable fallback, and every new district-aware order snapshots its
  district and fee. The loopback print plan and Go agent now include subtotal,
  discount, delivery price, district and final total on the non-fiscal receipt.
- 2026-08-21: delivery configuration expanded from tariff-only editing to a
  fully admin-managed directory. Authorized administrators may create and edit
  welayats and etraps, multilingual names, ordering, parent assignment and all
  pricing/availability fields. New IDs use PostgreSQL sequences; etraps are
  disabled rather than deleted so existing address relations and immutable
  order/receipt snapshots remain valid.
- 2026-08-21: catalog category groups became accessible accordions with
  first-group, per-group and expand/collapse-all navigation. The phone-assisted
  address flow now suggests an enabled tariff zone only for one unambiguous
  multilingual name match, immediately displays its configured fee, clears a
  stale zone when the marker moves, and keeps explicit confirmation for every
  ambiguous location. The backend still validates the etrap and calculates the
  authoritative order total.
- 2026-08-21: map coordinates became the single source of truth for assisted
  delivery through `POST /delivery/quote`; the server returns the official
  address, configured price and unambiguous etrap match, and marker movement
  updates the visible search field instead of retaining the previous result.
- 2026-09-22: delivery tariff ownership moved toward administrator-drawn map
  polygons. Etraps store validated non-overlapping boundaries, the delivery
  screen provides an overview and click-to-draw editor, and an explicit
  versioned `mapPricingEnabled` switch preserves legacy text matching until all
  active zones are ready. In map mode backend point-in-polygon resolution is
  authoritative for quotes and final order pricing; address text no longer
  chooses the tariff.
- 2026-08-22: receipt routing gained an audited main-printer setting, category
  kitchen-printer defaults and product-level overrides. Every print plan now
  contains one complete administrator copy plus kitchen copies grouped by the
  effective route snapshotted on order creation; public catalog responses still
  expose no private printer address.
- 2026-08-22: the dispatcher map began in an explicit all-couriers live
  overview, kept every located courier in view while a selected route is
  overlaid, and permanently labelled couriers with their free/busy state.
  Courier GPS now remains a whole-shift contract, including after delivery,
  until explicit stop sharing. Catalog administrators also gained direct
  per-category visibility and X-printer controls. A category address is the
  default, while a product address exclusively overrides it and does not create
  a duplicate kitchen copy on the category printer. The accompanying regression
  contract records pure frontend cases, API authorization/public-visibility
  coverage, post-delivery movement, print-plan grouping, and manual QA.
- 2026-08-21: administrators gained audited, version-locked pre-pickup order
  editing, canonical one-step pre-pickup rollback, and cancellation through
  `DELIVERED`. Operators remain limited to assisted order creation and courier
  assignment or reassignment before pickup; they cannot cancel orders or
  change workflow statuses. Courier pickup/completion were documented on the
  existing transition endpoint.
- 2026-08-21: assisted official-address search became a 350 ms debounced
  autocomplete while Enter and the search button remain immediate. Selecting
  an address or marker now owns tariff resolution completely: an unambiguous
  configured match is stored automatically and every other location uses the
  backend fallback quote, so the operator never repeats the address decision
  in a mandatory district dropdown.
- 2026-08-22: administrator workflow rollback was limited to pre-pickup
  orders. After the assigned courier confirms pickup and the order becomes
  `OUT_FOR_DELIVERY`, neither `ADMIN` nor `SUPER_ADMIN` may move it backward;
  the separately authorized late-cancellation policy remains unchanged.
- 2026-08-22: banner management gained an audited permanent-delete operation
  for `ADMIN` and `SUPER_ADMIN`. The admin requires a separate confirmation,
  removes the record from both admin and customer queries, invalidates the
  existing marketing cache, and deliberately retains the private image object.
- 2026-08-22: all ten administrator routes gained one maintained tablet QA
  contract. The shared drawer covers widths through 1180 px, portrait tablets
  stack the courier map above its live context, workspaces cannot widen the
  page, coarse-pointer controls are at least 44 px, and the documented real API
  smoke covers every route without browser automation.
- 2026-08-22: the phone-assisted address editor adopted an explicit
  choose-then-map workflow. Search results render in normal document flow and
  move the marker only after selection; the resolved location has a separate
  summary, while entrance, floor, apartment and courier landmarks are clearly
  identified as non-geographic delivery details.
- 2026-08-25: phone-order courier details gained a functional regression
  contract. Changing a prefilled saved entrance, floor, apartment or landmark
  now keeps the selected coordinates and submits a newly active address with
  those edits; backend HTTP coverage verifies the details in both the saved
  address and immutable order snapshot.
- 2026-08-25: admin navigation became height-safe on desktop and tablets. The
  sidebar owns vertical touch scrolling, an open drawer locks background
  scrolling, and large coarse-pointer tablets retain the drawer through
  1366 px landscape width. A pinned internal close control remains reachable at
  every scroll position and restores keyboard focus to the menu trigger.
- 2026-08-25: the order workflow was reduced to eight statuses. Customer-app
  and assisted orders now start directly in `COOKING`. Generic
  `COOKING → READY` transitions are denied; `ADMIN` or `SUPER_ADMIN` uses the
  packing-confirmation action to atomically complete that step. Cash return is
  itself the completed state, sets `completedAt`, confirms the order-specific
  settlement, and moves directly to accountant reconciliation. Customers and
  operators cannot cancel; administrators retain cancellation through
  `DELIVERED` and the two safe pre-pickup rollback steps.
- 2026-08-25: the admin order board was reduced to two active lanes. The
  `kitchen` lane combines `COOKING` and `READY`; the `courier` lane covers
  assignment through delivery. Cash-returned, reconciled and cancelled orders
  remain in the collapsed archive below the board.
- 2026-08-25: every successful administrator cancellation now automatically
  dispatches a `CANCELLATION` receipt plan to the configured main and kitchen
  printers. The cancellation receipt retains the order number and items, marks
  every chunk as `CANCELLED ORDER`, includes the stored reason, and remains
  manually reprintable if the local print attempt fails.
- 2026-08-26: customers may cancel their own active unsettled order during the
  first 15 minutes after creation. The backend enforces ownership, the time
  window, active status and optimistic version; operators remain unable to
  cancel, while administrator cancellation through `DELIVERED` is unchanged.
- 2026-08-25: receipt-printer endpoints moved from free-text catalog fields to
  an audited PostgreSQL registry with name, private IPv4 address, port,
  transport and active state. Main, category and product routes reference
  registry IDs; a product override remains exclusive and higher priority than
  its category default. Order items snapshot the full endpoint. The loopback
  agent now dispatches both raw TCP ESC/POS (including port 9100 printers) and
  legacy J-Speed HTTP, while old IP-only API payloads remain a temporary
  backward-compatible port-80 fallback.
- 2026-08-26: the six LAN X-printers discovered at
  `192.168.123.100`, `.101`, `.105` and `192.168.0.4`, `.86`, `.87` are
  preloaded as editable active RAW TCP port-9100 registry entries. Existing
  records at those endpoints are preserved rather than renamed.
- 2026-08-23: catalog administrators gained audited permanent deletion for
  products and categories that have no order history. A protected product or
  category returns `409 Conflict` and remains available for hiding, preserving
  historical orders and receipt snapshots. `/catalog` now presents deletion
  confirmations plus explicit clear controls for main, category, and
  product-level printer addresses; clearing a product override resumes category
  inheritance.
- 2026-08-23: production diagnostics found two active couriers but no current
  Redis GPS keys; the single visible dispatch point was a branch. The dedicated
  `/courier` web shift route was restored as an isolated `COURIER` workflow
  without admin-navigation access. Dispatch now reports GPS coverage, names
  couriers without coordinates, and labels branch markers explicitly. Delivery
  completion leaves the publisher mounted; only the end-shift action deletes
  the point.
- 2026-08-27: authenticated customers gained a side-effect-free order quote
  endpoint for cart and promo preview. It resolves current product variants,
  validates the customer's promo eligibility, proportionally allocates the
  rounded discount to visible lines, includes delivery pricing, and neither
  creates an order nor consumes promo usage. Final order creation repeats the
  same authoritative checks because a quote does not reserve price or promo
  availability.
- 2026-08-27: technical catalog slugs were removed from the administrator UI.
  Category and product creation now generates a unique transliterated slug on
  the backend when omitted, while existing slugs and optional explicit API
  input remain supported for backward compatibility.
- 2026-08-28: catalog products gained explicit mutually exclusive `FIXED` and
  `VARIANT` pricing modes. Variant products have no editable base price, require
  a selector and an active option, display `от minPrice` before selection, and
  cannot be added by new clients without an explicit `variantId`.

## Durable receipt delivery — 2026-09-04

Order creation (including phone orders) and cancellation atomically insert a
PostgreSQL receipt task with a frozen backend plan and stable dispatch UUID.
The admin receipt feature claims tasks using a leased, serialized server queue;
notification observation and cancellation callbacks no longer trigger printing.
The Go agent persists its installation identity and fsynced per-copy dispatch
journal, resumes only definitely unsent copies and rejects duplicate payload
conflicts. Unknown delivery stops automatic retry and requires paper inspection.
The same RAW printer has a 1.5-second cooldown between copies, including across
orders. Manual reprints create a new audited identity after explicit confirmation.
Receipt metadata supplies customer/delivery details and the configured contact
phone for the table-formatted receipt; no fixed HALTURIN label is printed.

The frontend slice remains `features/receipt-printing`; backend queue DTOs,
controller and service belong to `orders`. See `RECEIPT_QUEUE.md` for protocol,
tests, Windows/Mac releases, upgrade coordination and rollback. Production
push/deployment was explicitly authorized by the user on 2026-09-04.

## Preparation timing, receipt copies and ordering hours — 2026-09-24

Each product has an administrator-managed `preparationMinutes` (0–1440). The
public catalog exposes it, and each order line snapshots it. For a newly
created order, the kitchen receipt for each line becomes eligible at
`order.createdAt + max(order line preparationMinutes) - line preparationMinutes`.
Thus a 30-minute dish prints immediately while a 10-minute dish in the same
order prints 20 minutes later. The delay is durable in `ReceiptPrintTask` and
survives agent disconnection. The complete main receipt is immediate and its
audited setting controls 1–3 copies, defaulting to two. The API queues one
ordinary task per main copy, so the existing print agent and browser bridge
print one main job per task without a software update. Kitchen jobs keep the
line's snapshotted printer route. Cancelling an order cancels its pending/failed
ORDER receipts, including manual and edit tasks, before queuing one main
cancellation copy and cancellation of only already delivered kitchen portions.
The configured 1–3 ordinary main copies do not multiply automatic cancellations.

Manual print from the order board sends selected lines immediately. An
administrator may override each line's kitchen apparatus for that one print,
choose only the main cash register, or omit a dish from both the main and
kitchen copies. For that manual print an administrator may independently
choose 0–3 main copies: zero omits the main job entirely. Omitting `mainCopies`
from the API request preserves global defaults and previous retry hashes.
Explicit counts require administrator authorization and are validated/audited;
a changed count with the same idempotency key conflicts. With the main receipt
disabled, every included dish needs a kitchen destination, and invalid requests
leave automatic tasks untouched. The global automatic copy setting and print
agent protocol remain unchanged. The dialog keeps main controls and buttons
visible while the dish list scrolls; unchecked dishes are omitted entirely.
At least one dish must remain. A partial main copy keeps the
order's actual total and carries an explicit warning that the printed item
list is incomplete. An operator may request a full print with saved routes.
After validation the transaction cancels pending, failed and uncertain
automatic receipt tasks for the order before creating idempotent tasks for
the requested main copies. Reusing a manual print key with a different
selection is a conflict.
Automatic tasks created by order edits (`ORDER_EDITED`) follow the same
cancellation rules as the original order tasks: order cancellation stops
pending/failed edit tasks, and manual printing supersedes pending/failed/uncertain
edit tasks, including replacement main copies and delayed kitchen tickets.
It refuses to race a processing task. Cancelled and delivered task history is
available to operations staff; scheduling, delivery results and manual routing
are audit logged. A pending future task cannot be manually retried early.

When an administrator changes food in an order, the API synchronizes waiting
receipt tasks in the same transaction. Removed unprinted dishes disappear from
their tickets without a paper cancellation; other dishes in shared tasks stay.
Quantity-only changes update the same unattempted kitchen ticket and preserve
its deadline. Adding a new dish or changing the longest preparation time
reschedules retained unprinted dishes from the edit time; new dishes follow
the same preparation-time difference. Delivered kitchen portions are tracked
separately: removing or reducing them queues an immediate cancellation for only
the removed portions (one main copy and their actual kitchen endpoints), and
increases queue only the additional portions. Already queued item cancellations
survive subsequent edits/full cancellation and are not duplicated. A waiting
main copy with stale food or totals is cancelled and replaced with a current
copy; delivered copies remain in history. Retained product/variant lines keep
their UUIDs across edits. Unique legacy printed identities are reconciled with
audited aliases without rewriting frozen dispatches. An edit conflicts while
any receipt is processing, uncertain, or awaiting a retry after an attempt,
because paper in transit or with unknown delivery cannot safely be rewritten.
Full cancellation remains available during a send: a later matching successful
acknowledgment queues only the outstanding kitchen cancellation, with no second
main copy. A retry/expired lease after cancellation stops for inspection instead
of resuming original food tickets. DELIVERED remains transport confirmation,
not a physical-paper sensor. Claims, acknowledgments, edits and cancellation
share the queue lock; optimistic order versions and audit remain authoritative.
An `ADMIN` or `SUPER_ADMIN` can also cancel one `PENDING` receipt
from the queue, including a future kitchen task; processing and delivered
tasks cannot be cancelled. Both paths are audited, and the queue shows dish
names so staff can identify the correct task. The print agent protocol stays
unchanged.

The 2026-09-25 follow-up to these receipt features is pushed to the
`codex/map-delivery-zones` branch for review. The user requested no production
deployment in this handoff; only `main` triggers the production workflow.

For the temporary legacy mobile compatibility window, order creation accepts
`latitude: null` and `longitude: null` as omitted values, using the selected
or active saved address. A lone numeric coordinate still fails validation;
new inline addresses still require both valid coordinates. Keep this shim
until mobile clients stop sending null coordinates and its removal is approved.
On 2026-09-26 the user authorized merging the compatibility fixes and the
feature branch into `main`, followed by deployment over local workstation SSH.

The separate `GET /ordering-hours` response is public and contains the
server-calculated `isOpen`, `Asia/Ashgabat` timezone, local open/close times,
and server time. Administrators configure it on the catalog's «Время работы»
tab with optimistic version checking and audit. The setting is initially
disabled (ordering always open); when enabled, customer-app order creation is
rejected outside the daily interval, including intervals crossing midnight.
Phone-assisted staff orders remain available. The public response is for mobile
display; the API check is authoritative.

The login-attempts workspace counts customer accounts with a successful OTP
login as registered, and accounts created by staff but without a successful
login separately. Anonymous app visitors cannot be counted reliably from the
current data model because no anonymous installation telemetry is stored.

## Dispatcher map usability — 2026-09-12

The first iteration used compact all-courier GPS markers with overlapping
points grouped, and filtered to one courier through the name menu or drawer. The always-complete drawer expands food, destination and
customer comments beneath the selected courier. Overview routes were opt-in;
this default and clustering are superseded by the correction below.
Manual map pan/zoom survives SSE updates. This supersedes the earlier default
of simultaneously drawing every route and retaining all markers on selection.

Verification used the real isolated local API with 16 couriers/11 orders in
Chromium, Firefox and WebKit at 1440/820/390 px: all nine scenarios passed,
including missing GPS, multiple orders, blank comments, overlapping points,
keyboard controls and history. Empty dispatch and CUSTOMER denial were checked.
There is one snapshot and SSE connection per view, with zero overview route
requests while routes are hidden. Lab LCP was 0.709–1.588 seconds, CLS 0 and
courier selection 26–59 ms; these are not production p75 measurements.
The entry is 244.04 KB raw / 77.33 KB gzip, about 0.9 KB more raw than the
pre-change build; dispatch/map code and CSS remain lazy. All 143 admin tests,
build/typecheck, lint (only three existing phone-field warnings), audit with
zero vulnerabilities and import-cycle checks passed.

Docker was unavailable, so QA used isolated native PostgreSQL 14 / Redis 7;
private OSRM was unavailable and its real API fallback was checked. Existing
local print-agent connection errors were the only browser console errors.
Evidence and limitations are in `outputs/courier-map-20260912/DEV_NOTES.md`.
No deployment or production data mutation was performed.

The follow-up local demo on 2026-09-12 recovered Docker Desktop and started
the existing OSRM Turkmenistan graph. Successful road geometry is now verified
visually in the open local map; seven active couriers have usable road paths.
The demo samples movement along geometry returned through NestJS and publishes
synthetic GPS every three seconds. Its selected and all-courier buttons enable
route lines. This supersedes the earlier local-demo OSRM limitation; no
production application or policy was changed.

### All-courier visibility correction — 2026-09-12

User feedback rejected clustering and indistinguishable colors. All located
couriers now render individually; 16 demo couriers have distinct colors shared
by their marker, drawer number, road geometry and delivery labels. All-courier
routes are on by default, including after returning from a selected courier.
The old selection handler reset `routes`, unintentionally hiding overview lines.
Route loading now shares per-courier queries with selection, limits simultaneous
requests to three and invalidates only the courier whose GPS changed.

Verification of this correction: 144/144 admin tests, build/typecheck, lint
(existing phone-field warnings only), audit with zero vulnerabilities, frontend
hygiene and 182-file import-cycle check passed. The open local Chromium map at
1440/820/390 px showed 15 individual markers, 16 distinct roster colors and
seven READY road lines, with no horizontal overflow. Selection preserved colors
and returning to all couriers preserved routes. During 59.43 seconds including
interactions, CDP measured 759.75 ms scripting and 82.58 ms layout. Entry size is
244.03 KB raw / 78.30 KB gzip; map modules remain lazy. Firefox/WebKit were not
retested for this final correction because only the in-app browser was available.
Detailed evidence and limitations: `outputs/courier-map-20260912/DEV_NOTES_COLORS.md`.

## Courier map release recovery — 2026-09-13

The saved drawer and distinct-route implementation was commit `41c30fb` on
`codex/courier-map-visibility`; it had not been merged into `main`. Later releases
therefore still contained the older map. This release integrates that retained
implementation with current main and corrects the misleading website GPS help.
Mobile clients continue using the existing authenticated whole-shift tracking
API. No tracking API, permissions, location TTL, database schema or mobile build
is changed by this frontend release.

## Role-wide page access with cross-role grants — 2026-09-16

The temporary per-employee `/access` design was rejected. Page access is
role-wide: `SUPER_ADMIN` configures `ADMIN`, `OPERATOR`, `COOK`, `COURIER`, and
`ACCOUNTANT`, and every member of the selected role receives the same pages.
Unlike the original role matrix, every configurable role can now receive any of
the 14 admin pages. This includes granting normal operations-admin pages to the
`COURIER` role, which enables the normal admin shell for all couriers. The role
policy is loaded into every authenticated backend request, page metadata is
enforced by the global authorization guard, and the same policy drives React
navigation and direct-route protection. The individual-access table introduced
by the superseded release is retained only as inactive legacy data; it is not
read or written by the application.

## Order-role policy alignment — 2026-09-20

The current backend policy is the accepted role contract. `COOK` has read-only
order visibility and no order-status transition. Only `ADMIN` and `SUPER_ADMIN`
may confirm packing, which moves `COOKING` to `READY`. `OPERATOR` may create an
assisted order and assign or reassign its courier before pickup, but may not
cancel an order or change any workflow status. `DELIVERED → CASH_RETURNED` is
performed by the assigned `COURIER`, `ADMIN`, or `SUPER_ADMIN`, not by
`OPERATOR`. This supersedes earlier narrative language that described cook
claiming, operator workflow transitions, operator cancellation, or operator
cash confirmation.

## Catalog transfer and pagination — 2026-09-20

The operations catalog no longer downloads the complete catalog twice. Its
initial category request returns category/printer fields plus `productCount`
without nested products. The product request starts only when the `Блюда` tab
opens and uses server-owned literal text/category filtering with 40-item pages.
Hidden records, variants, image editing, printer inheritance, deletion checks
and mutation invalidation remain available. Existing full-list catalog routes
remain backward compatible for assisted ordering, marketing, inventory and
other consumers while they are migrated independently. The production gateway
and static admin container gzip JSON, JavaScript and CSS responses.

## Loyalty gifts and selectable kilometer delivery — 2026-09-25

Every catalog dish has an administrator-configured positive number of loyalty
points per unit; existing dishes receive one point by default. An order saves
the point amount of each line and its total. Points are credited once when the
order reaches `DELIVERED`. A later permitted administrator cancellation reverses
that credit. A balance can become negative after reversal if the customer has
already spent the earned points; new redemptions require sufficient balance.

The administrator manages toy/gift names, descriptions, WebP photos, point
prices, visibility, and optional stock in the catalog's Gifts tab. Gift edits
use a version check and audit record. Public `GET /loyalty/gifts` lists only
active, available gifts; authenticated customers get their balance and recent
ledger at `GET /loyalty/me`. The customer application is developed in a
separate repository and consumes these endpoints plus the order contract.
There is no separate gift checkout: a customer's order must contain at least
one food item, and `gifts` can be requested only on that customer's own order.
Phone-assisted staff orders cannot spend a customer's points. Gift cost and
stock are reserved atomically with the food order and snapshotted on it; a
permitted cancellation refunds the points and returns limited stock. Order
creation idempotency also covers gifts.

The existing street/etrap tariff remains available. An administrator switches
`distancePricingEnabled` to choose kilometer pricing instead. In that mode the
server selects the nearest active branch and uses the Haversine formula on its
coordinates and the customer's coordinates; this is a straight-line distance,
not an OSRM road route. OSRM remains the private courier route service. Day
and night prices per kilometer are separate settings and use the existing
Ashgabat night schedule. The kilometer fee has a minimum of 15 TMT and uses
whole-manat cash bands: 16→15, 17→20. Kilometer pricing ignores area free
delivery thresholds. A quote without coordinates is rejected in this mode;
customer orders use their selected address coordinates. The public delivery
config and quote disclose the selected mode, configured rates, calculated
distance, and fee so mobile clients can render the authoritative result.

## Configurable distance price tiers — 2026-09-27

Kilometer delivery supports up to 20 administrator-configured thresholds in
`distancePriceTiers`. Each threshold has `afterKilometers` plus its own day and
night price per kilometer. The initial day/night rate applies up to the first
threshold; each subsequent rate applies only to distance beyond its threshold,
until the next threshold. Earlier kilometers are never repriced. For example,
the first 5 km at 5 TMT/km and subsequent kilometers at 4 TMT/km give 29 TMT
before cash rounding for 6 km, resulting in 30 TMT. The 15 TMT minimum and cash
rounding apply once to the complete fee, not separately to each segment.

The `/delivery` configurator supports adding, editing and removing thresholds,
with separate day/night rates. Each row offers explicit edit/delete actions;
save/cancel controls beside the tier list commit or discard the draft. Deleting
a row takes effect only after saving. Background configuration refreshes preserve
dirty drafts and their original version, so concurrent saves produce a conflict
instead of silently replacing newer settings. Thresholds must be positive, unique and ordered;
distances and prices support two decimal places and values up to 10,000.
Configuration writes retain role/page authorization, require the current
settings version and audit the previous and resulting settings atomically.
An omitted array preserves existing rules; `[]` removes them and restores the
single rate. The additive migration defaults to `[]`, preserving existing
tariffs. Switching to area pricing retains the rules but does not apply them.

Public config and delivery quotes expose the tiers; `pricePerKilometer` stays
the initial rate and `fee` is authoritative. The same server calculation prices
order quotes, customer and assisted orders, and explicit administrator edits.
Changing settings alone never reprices saved orders or receipt snapshots.

The user authorized merging the configurator into `main` and deploying it on
2026-09-27. Apply the additive `20260927100000_distance_price_tiers` migration
before the matching API/admin release. Deployment must preserve the selected
pricing mode and existing rates; the user configures thresholds in the admin.


## Accountant oversight and monthly reports — 2026-09-27

The user expanded ACCOUNTANT visibility to read-only order contents, customers,
locations, cancellations/reasons, audit before/after evidence, product demand,
and district/branch analytics through dedicated /accounting endpoints. Other
roles cannot obtain the new inspection APIs merely through an expanded page
grant. Order edits/cancellations remain governed by existing operational roles.
The accountant continues to confirm submitted cash packets.

/accounting offers exact calendar months as well as date ranges and individual
shifts. Clicking a date in the orders chart selects that calendar day; each
shift card has a direct inspection button. Order creation, cash return and
audit action times are separate cohorts.
Food after discounts is the amount owed by employees; delivery stays separate.
Declared cash and packet discrepancies are visible; there is no system-fee
commission. Packet membership and submitted shift boundaries remain frozen.

Incoming/outgoing unfinished work is reconstructed at shift or calendar-period
boundaries, including cooking, assembly, delivery and delivered orders awaiting
cash return. Cash-returned, reconciled and cancelled orders do not carry over.
Current periods show a provisional live boundary. Old edits without complete
snapshots are explicitly marked unavailable, never reconstructed from guesses.
New order mutations save before/after business snapshots atomically; the order
audit also includes its receipt tasks and cash packet. Existing domain audits
are exposed with paginated filters and secrets redacted. The journal has no
write/delete API and does not claim to record menu clicks or prevent DB-owner
tampering. Physical money/stock reconciliation remains necessary.

The catalog and API accept preparation times from 0 through 1440 minutes; 520
minutes is valid and follows the same durable kitchen-ticket scheduling.
See ACCOUNTING_OVERSIGHT_MOBILE.md for mobile contracts, cohort semantics and
legacy limitations. Apply additive 20260927160000_accounting_inspection_indexes
before the matching API/admin release.


The owner authorized merging this accountant release into main and production
deployment on 2026-09-27. They also confirmed delivery and collected/returned
cash for all active orders created before 2026-09-27 00:00 Asia/Ashgabat. The
26 historical orders were completed through the existing authenticated API to
CASH_RETURNED with audit/transition notes, at the current recording time. No
unknown past timestamps were invented. Six orders without a courier received
random active courier assignments at the owner's explicit instruction; an
additional audit records that these are technical assignments, not evidence of
who actually delivered them. Cancelled and already completed orders were not
changed. The original database backup and scoped operation results are retained
on the VDS under maintenance/complete-before-20260927.


## Historical cash correction — 2026-09-27

The owner confirmed that the 26 pre-27 September orders completed during
maintenance had already been paid and their cash surrendered earlier. The
maintenance-created `CONFIRMED` settlements incorrectly assigned 5,505 TMT of
food to the 27 September day shift. A scoped owner-authorized correction
atomically reconciled those orders and settlements, incremented order versions,
and recorded `order.historical-cash-reconciled` before/after audits and
transitions. No cash packet existed or was rewritten.

For this historical batch only, `operatorTakenAt` is null because the actual
cash receipt time is unknown. Never invent a past shift or use the maintenance
time as a new cash receipt. Original erroneous timestamps remain in the audit;
`reconciledAt` records the correction time. Amounts, order creation dates and
monthly order-cohort analytics are preserved. These undated historical receipts
are visible through the orders/audit, but do not enter dated cash-receipt charts
or create a current employee liability. Normal live settlements keep their
actual receipt timestamps.

Production API verification: the affected day shift changed from 26 settlements
and 5,505 TMT ready to submit to zero; all other settlements were unchanged.
Scope, tested correction script, database backup and before/after evidence are
retained privately at
`/opt/alowalow/production/maintenance/historical-cash-correction-20260927/`.


## Readable accounting workspace — 2026-09-27

The accountant workspace opens on numbered orders. Separate sections expose
shift cash, monthly charts, named employee actions and incoming/outgoing work.
Selecting a calendar month opens the charts; choosing a chart day opens that
day's orders using its creation or cash-return basis. Financial totals and
creation cohorts remain distinct. Mobile uses readable order cards and a
full-screen, keyboard-dismissible detail dialog with separate contents/people
and history views.

Dedicated read-only inspection responses now include assigned cook, actors and
their recorded actions, cash operator/accountant names, and an explicit flag for
historical technical courier assignments with unknown actual deliverer. Missing
participants are shown as unknown, never inferred as the actual courier or cash
recipient from a maintenance actor. Journal pages batch-resolve order numbers
and referenced staff names, including old records without before/after data.
Technical IDs and raw evidence remain in expandable technical details; primary
entries show Russian action labels, order numbers, staff, time and changes.
No operational mutation rights or cash calculation rules change.
