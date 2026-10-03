# AlowLink Platform context

## Product decision — 2026-10-03

AlowLink is the new brand for the AlowAlow marketplace for many independent cafes and a shared courier
network. The imported A7-tagam system supplies catalog, ordering, dispatch,
cash accounting and receipt printing. Its current Cafe records are virtual
catalog brands: products from different cafes can enter one cart and every
order is routed to the same branch network. This is not yet tenant isolation.
The new platform must change this boundary before onboarding independent cafes.

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
  one-cafe checkout HTTP API.
- apps/admin: Imported legacy A7 operations SPA.
- apps/merchant: Separate cafe and platform OWNER React/Vite portal.
- apps/print-agent: Imported local receipt bridge.
- apps/desktop: Imported workstation source, not a merchant release.
- packages/api-contract: Generated API contract.
- docs/legacy: Previous single-operator context, README and inactive deployment scripts.

The baseline source is the clean origin/main snapshot of Guvanch99/alowalow
at 0eb18f7. Uncommitted work in that checkout was not copied. The source
production installation remains independent and untouched.
