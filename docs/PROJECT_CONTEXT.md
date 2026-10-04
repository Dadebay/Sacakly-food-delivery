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
Only ORDERING is currently activatable in the new tenant API; other module
keys are reserved until their tenant boundaries and workflows are implemented.

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

The imported print queue and agent credential are global. Marketplace orders
currently do not enqueue physical print tasks or inherit the legacy default
printer or contact phone. Legacy manual reprint rejects marketplace orders.
This is a temporary isolation gate: cafe-specific printer registration,
queue claims, agent credentials and receipt access must be implemented and
tested before a cafe can use printed receipts. The RECEIPTS entitlement cannot
be activated yet.

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
the external network. For network delivery, the maximum snapshotted item
preparation time determines the offer schedule: publish 40 minutes before
estimated readiness, never before order creation. Thus a 60-minute order is
offered 20 minutes after creation. Approved active network couriers can see a
minimal offer without customer address; the first atomic claim wins. A claim
reserves the courier while food is cooking. After the cafe confirms every item
is packed, the existing order state machine moves READY then assigns the
reserved courier and sends the normal courier push. An offer is never created
for a cancelled or already assigned order. Push notifications to approved
network couriers are best effort; the durable offer remains available through
the courier API when push delivery fails. The web courier page can refresh and
claim offers.

No automatic ETA, courier shift/availability system or tenant-scoped receipt
printing is claimed. Existing global order paths outside the new marketplace
controllers still need a full tenant authorization audit before onboarding
independent cafes.

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

- apps/api: Existing NestJS API; tenant migration target.
- apps/api/src/marketplace: Owner, cafe membership, courier application and
  one-cafe checkout and delivery offer HTTP API.
- apps/api/src/site-pages: OWNER-managed localized public pages.
- apps/admin: Imported legacy A7 operations SPA.
- apps/merchant: Separate cafe and platform OWNER React/Vite portal.
- apps/web: Next.js customer website and PWA with FSD layers.
- apps/print-agent: Imported local receipt bridge.
- apps/desktop: Imported workstation source, not a merchant release.
- packages/api-contract: Generated API contract.
- docs/legacy: Previous single-operator context, README and inactive deployment scripts.

The baseline source is the clean origin/main snapshot of Guvanch99/alowalow
at 0eb18f7. Uncommitted work in that checkout was not copied. The source
production installation remains independent and untouched.
