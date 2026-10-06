# Saçakly Platform context

## Product decision — 2026-10-03

Saçakly is the brand for a marketplace of many independent cafes and a shared courier
network. The imported single-operator system supplies catalog, ordering, dispatch,
cash accounting and receipt printing. Its current Cafe records are virtual
catalog brands: products from different cafes can enter one cart and every
order is routed to the same branch network. This is not yet tenant isolation.
The new platform must change this boundary before onboarding independent cafes.
The user selected a name without the legacy brand word; all new platform-facing
surfaces and package names use Saçakly. Existing mobile app IDs and the archived
source remain historical integration identifiers until new clients are released.

The product has four surfaces in one monorepo: customer experience, merchant
portal and workstation, courier experience, and platform OWNER console. The
existing apps/admin is a legacy operations interface until tenant scoping is
complete. Native mobile clients may have separate release artifacts, but their
backend contract is generated from this API.

The mobile handoff defines **two separate applications**, one for customers and
one for couriers. Cafe staff and OWNER use the web portal. The native clients
are planned releases, not existing Saçakly apps; their current API coverage and
release blockers are documented in `docs/mobile/`. In particular, imported
global order and tracking endpoints need tenant authorization checks before
they become supported native marketplace workflows.

The root package orchestrates development, builds and tests across the
monorepo. API, customer web, merchant portal and legacy admin each retain an
independent npm lockfile and pinned dependencies; they are not collapsed into
one npm workspace dependency tree. The shared API contract is generated from
Swagger and consumed by the web clients. The default root `dev` command starts
the Saçakly API, web and merchant portal; the imported admin has an explicit
legacy command. See `docs/MONOREPO.md`.

The customer selects one cafe and places one order with products from that
cafe. Changing cafe starts a separate cart. A merchant sees only its own
branches, menu, staff, orders, kitchen tickets, receipts and accounting. A
platform courier can apply to join the network, but cannot receive orders or
access customer details until approved and assigned. Platform dispatch can
assign an approved available courier across cafes. The order retains its cafe
and branch snapshot; courier assignment never transfers cafe ownership.

The platform OWNER account for the supplied phone +99362969614 controls cafe
approval, merchant access, courier approval, global dispatch and module
activation. The first successful OTP sign-in with this exact phone writes an
audited owner entitlement and promotes that account to SUPER_ADMIN.
Phone possession alone never grants OWNER: sign-in still requires OTP and the
server checks the active account and persisted entitlement on every protected
request. Changing the owner requires a recovery procedure, not a merchant
action.

Modules are server-owned entitlements scoped to platform or cafe. Disabled
modules deny the API mutation, not merely hide UI. Initial target modules:
catalog, ordering, kitchen, delivery, receipts, inventory, loyalty, accounting.
Changes use optimistic version checks and audit. Merchant managers configure
only enabled cafe modules; they cannot activate their own entitlement.
ORDERING is activatable in the new tenant API. RECEIPTS is activatable only
after a cafe administrator configures an active cafe printer and rotates a
dedicated agent token. Other module keys remain reserved until their tenant
boundaries and workflows are implemented.

The platform OWNER may create an independent Cafe, find an already registered
account by phone, assign or revoke cafe membership with a version check, and
review courier applications. A cafe member's global User.role does not become
ADMIN; rights for the new merchant API derive from CafeMembership. The cafe
portal is a distinct web application with a separate login session and only
cafe-scoped order lists. The imported operations UI remains a migration target.

Receipt printing follows the existing A7 implementation: an order snapshot,
durable main/kitchen/cancellation tasks, the workstation print agent, and
idempotent delivery with uncertain physical sends requiring inspection. Each
cafe needs its own printer routes and queue visibility. No new fiscal provider
is part of this request; the existing printed documents remain internal order
receipts.

The imported print queue and agent credential remain for historical orders.
Marketplace orders use cafe-owned printer records, main printer/copy/contact
settings, product or category kitchen routes, and a dedicated cafe agent token
stored only as a hash. The same durable receipt task engine filters every
claim, lease, acknowledgment, list, retry, cancellation and manual reprint by
the order's cafe. The legacy worker and legacy operations endpoints cannot see
or claim cafe tasks. A cafe agent uses `-api-scope marketplace` and the token
issued to that cafe; rotation immediately revokes the old token. Receipts
preserve order-item printer snapshots and print the cafe's identity instead of
the imported A7 header. OWNER activates RECEIPTS after setup. These are
internal order receipts, not fiscal documents. Hardware delivery still needs
an acceptance test at each cafe before release.

Cash on delivery remains the supported payment method during the first
migration. Online payment, platform commission, cafe payouts, taxes and refunds
require confirmed rules before implementation.

## Saçakly customer web, content and courier routing — 2026-10-04

The new `apps/web` is a Next.js App Router customer website using FSD layers.
Its public cafe listing shows only active cafes with the ORDERING entitlement;
the cart holds items from exactly one cafe. Customers may request OTP, quote
server-owned totals and create a cash order from the web. The website supports
Turkmen, Russian and English, with locale routes, page metadata, canonical URLs,
alternate languages, sitemap and robots. The brand uses deep green `#14523b`,
leaf green `#dbe9d5`, red `#c9473d` and ivory `#f7f5eb`. Color is a brand and
contrast choice, not a medical claim about appetite.

The OWNER edits plain-text localized site pages and SEO title/description in
the separate merchant console. Drafts are never public. Publishing uses an
optimistic version and audit. Slug `home` controls the homepage headline and
description; `/[locale]/p/[slug]` renders other published pages. The web PWA
service worker caches immutable static assets only, never API responses or
personal orders. Indexing is disabled until a real HTTPS public origin is
configured.

A cafe manager (`ADMIN` or `OPERATOR` membership) chooses delivery on each
marketplace order. An active cafe courier has a `COURIER` membership, and OWNER
may grant that membership to an OTP-registered customer, promoting the global
account to `COURIER`; revocation removes cafe access but leaves the role for
audit. The manager may reserve an own courier before food is ready or select
the external network. When a new order has no active cafe courier membership,
checkout automatically creates an audited NETWORK request; a manager can
change that route before it is claimed. This is based on active membership,
because shifts and live availability are not implemented yet. For network
delivery, the maximum snapshotted item
preparation time determines the offer schedule: publish 40 minutes before
estimated readiness, never before order creation. Thus a 60-minute order is
offered 20 minutes after creation. Approved active network couriers can see a
minimal offer without customer address; the first atomic claim wins. A claim
reserves the courier while food is cooking. After the cafe confirms every item
is packed, the existing order state machine moves READY then assigns the
reserved courier and sends the normal courier push. An offer is never created
for a cancelled or already assigned order. The OFFERED transition and one
Firebase direct-push outbox event per approved courier commit together.
Transient FCM failures retry with bounded backoff, successful device tokens
are not resent, invalid tokens are deactivated, and retries for closed offers
are cancelled. Provider acceptance does not prove that a human saw the push;
the durable offer remains available through the courier API. The web courier
page can refresh and claim offers.

No automatic ETA or courier shift/availability system is claimed. Existing global order paths outside the new marketplace
controllers still need a full tenant authorization audit before onboarding
independent cafes.

## Cafe onboarding, cuisine filters and private reports — 2026-10-06

Cafe cuisine tags are independent of menu `Category`. An OWNER may assign up to
four controlled tags (`SUSHI`, `BURGERS`, `FAST_FOOD`, `PIZZA`, `TURKMEN`,
`BAKERY`, `COFFEE`, `OTHER`) at creation or through a versioned, audited cafe
profile update. The public cafe endpoint accepts one validated cuisine filter;
the three localized storefronts display the same cafe tags. A cafe remains
invisible until active and explicitly entitled to ORDERING. An OWNER list
includes unpublished cafes for onboarding.

Before OWNER can enable ORDERING, the cafe must have at least one cuisine tag,
an active ADMIN membership with an active account, an active branch and an
active product in an active menu category. OWNER and cafe staff can read the
same readiness checklist through separately authorized endpoints. The cafe
catalog editor and receipt setup work while ORDERING is disabled, so an
administrator can prepare the tenant before publication. Once published,
versioned profile, membership and catalog updates cannot remove the last
required onboarding item until ORDERING is disabled. These writes and module
activation lock the same cafe row, so concurrent removals cannot both pass the
check. Already-enabled imported cafes can complete missing setup in stages;
updates preserve every requirement they already satisfy. Receipt activation remains
separate and requires an active cafe printer and dedicated agent token.
Physical printer acceptance is still a human on-site release check; software
configuration alone does not certify paper output.

Cafe ADMIN and ACCOUNTANT memberships can read an order/cash report limited to
their cafe and a validated 1–93 day date range in Asia/Ashgabat. It counts
orders by creation date, excludes cancelled orders from order value, treats
`CASH_RETURNED` and `RECONCILED` as collected cash, and shows `DELIVERED`
amounts awaiting cash return. It is an operational report, not a commission,
payout or tax ledger. Staff can inspect historical orders and reports even if
ORDERING is later disabled; write operations and customer checkout remain
module-gated. Legacy mixed-cafe orders are excluded because they have no
independent `cafeId`.

Cafe `ADMIN` and `OPERATOR` members can manage their own categories,
fixed-price products and branches in the merchant portal through a dedicated
marketplace catalog API. An active cafe and membership are required; setup
is available before ORDERING is enabled. The own-courier roster is also
readable before publication, while delivery mutations still require ORDERING.
Writes validate the cafe boundary, use
optimistic versions and audit changes. Slugs are prefixed with the cafe UUID
to preserve legacy global uniqueness. Existing orders keep their product and
branch snapshots when the menu changes. Variants, translated menu content,
media uploads and inventory remain outside this new editor. Cafe printer routes
are configured in the separate Receipts tab.

## Tenant boundary

- Cafe becomes the tenant. Category already references it. Branch, staff
  membership, order, printer configuration, inventory and reports require
  tenant linkage or an enforced relation through a tenant-owned parent.
- New orders require one cafe, one-cafe item validation, a branch from that
  cafe, tenant-aware idempotency, pricing, history, receipt and audit.
- Historic orders may contain products from multiple virtual cafes. Preserve
  those rows as legacy shared-operator data; never attribute their money,
  stock or customer data automatically to a new independent merchant.
- Global customers and approved couriers are platform identities. Merchant
  rights come from active cafe membership, not a global admin role.
- OWNER may inspect all tenants through audited platform endpoints. Merchant
  APIs require explicit cafe context and reject cross-tenant IDs.

## TDD migration sequence

1. Introduce tested tenant and owner policies, additive schema and migration.
2. Enforce one-cafe checkout and tenant branch selection on the real API, then
   scope merchant read/write paths, printer routing and accounting.
3. Add merchant portal/workstation, courier application and OWNER console over
   protected APIs.
4. Migrate the two virtual brands deliberately, reconcile mixed historical
   orders, test isolated data and rollback in a separate environment.
5. Add fiscal or online payment adapters only after their contracts are agreed.

Every phase needs allowed and forbidden role tests, cross-cafe ID tests,
concurrency/idempotency tests, generated API contract and real HTTP checks.
No imported A7 deployment pipeline may deploy this project.

## Repository tree

The current behavioral contract lives in this file. Read `docs/CHANGELOG.md`
for the chronological PR record and `docs/PLAYWRIGHT_E2E.md` for the isolated
browser test environment. Every pull request must append a dated history entry;
CI checks that rule. The Playwright suite exercises the local customer web,
merchant portal and API together, while API tests remain authoritative for
role matrices, courier races and receipt state transitions.

- apps/api: Existing NestJS API; tenant migration target.
- apps/api/src/marketplace: Owner, cafe membership, courier application and
  one-cafe checkout, onboarding readiness, private reports, catalog management,
  delivery offers and cafe receipt HTTP API.
- apps/api/src/notifications: Firebase delivery plus a durable direct-push retry outbox.
- apps/api/src/site-pages: OWNER-managed localized public pages.
- apps/admin: Imported legacy A7 operations SPA.
- apps/merchant: Separate cafe and platform OWNER React/Vite portal.
- apps/web: Next.js customer website and PWA with FSD layers.
- apps/print-agent: Imported local receipt bridge.
- apps/desktop: Imported workstation source, not a merchant release.
- packages/api-contract: Generated API contract.
- docs/legacy: Previous single-operator context, README and inactive deployment scripts.
- docs/mobile: Customer and courier application handoff, API coverage and release blockers.
- docs/MONOREPO.md: Application boundaries and root development/check commands.

The baseline source is the clean origin/main snapshot of Guvanch99/alowalow
at 0eb18f7. Uncommitted work in that checkout was not copied. The source
production installation remains independent and untouched.
