# NestJS backend instructions

These rules apply to everything under `apps/api/` and extend the repository root
instructions.

## Architecture

- Organize code by business module: `auth`, `users`, `branches`, `catalog`,
  `marketing`, `media`, `orders`, `tracking`, and `routing`.
- Controllers handle HTTP concerns only: decorators, DTOs, status codes, and
  passing the authenticated actor to a service.
- Services own use cases, authorization details that depend on loaded data,
  transactions, and orchestration.
- Keep reusable policy decisions in explicit policy files such as
  `orders/order-policy.ts`.
- Prisma is the only application access layer for PostgreSQL. Do not introduce
  raw SQL except for a documented locking or database-specific requirement.
- External systems stay behind injectable services: Redis, the Android SMS
  gateway, S3, and
  future maps/routing providers.

## API and validation

- Every request body, query, and path identifier must use a DTO or a Nest pipe.
- Keep global whitelist validation enabled; unknown fields must be rejected.
- Use Swagger decorators on public endpoints and DTO properties.
- Return stable domain errors with Nest exceptions; never leak provider errors,
  SQL details, secrets, hashes, or stack traces.
- When a controller contract changes, regenerate OpenAPI and the frontend
  client with `npm run api:client`.

## Authentication and authorization

- Phone login is passwordless: Redis-backed one-time OTP delivered by the SMS
  provider, then JWT access and rotating refresh tokens.
- OTP values and phone-derived Redis keys must remain HMAC-protected. Keep
  atomic issue, attempt counting, one-time verification, rollback, cooldown,
  and TTL behavior.
- Refresh tokens stay Argon2-hashed in PostgreSQL and rotate atomically.
- Never trust the role embedded in a JWT without checking the current active
  database user.
- `SUPER_ADMIN` inherits administrative endpoint access through `RolesGuard`.
  Service-level ownership and domain invariants still apply.
- The configured platform OWNER phone is promoted to `SUPER_ADMIN` only after
  successful OTP verification and an audited owner entitlement write. Other
  `SUPER_ADMIN` grants, modifications and removals require an active
  `SUPER_ADMIN`; at least one active account must remain.
- Add an audit record for security-sensitive staff, catalog, cash, and workflow
  changes.

## Order workflow invariants

- The canonical transition matrix lives only in
  `src/orders/order-policy.ts`.
- Enforce actor ownership:
  - a cook may act only on the order they accepted;
  - a courier may act only on orders assigned to them;
  - a customer may read/rate/cancel only their own order where allowed.
- Cancellation policy:
  - a customer may cancel only their own active unsettled order within 15
    minutes of its creation; `OPERATOR` cannot cancel;
  - `ADMIN` and `SUPER_ADMIN`: active operational statuses from `COOKING` through
    `DELIVERED`, but never `CASH_RETURNED` or a later/terminal status.
- Only `ADMIN` and `SUPER_ADMIN` may move an active order backward before
  courier pickup or edit business-owned order content before courier pickup.
  Once the courier moves an order to `OUT_FOR_DELIVERY`, no role may move it
  backward. Recalculate items,
  promo discount, delivery, total, and nearest branch on the backend; never
  accept raw financial totals. Content changes after packing invalidate the
  packing confirmation, and item changes after cooking began return the order
  to `COOKING` while clearing cook and courier. Preserve
  identity/accounting/audit fields.
- One courier may have multiple simultaneous active orders. Do not add a unique
  constraint or a one-active-order guard.
- Courier routes return all `ASSIGNED_TO_COURIER` and `OUT_FOR_DELIVERY`
  orders assigned to that courier plus a real OSRM road route when available.
  OSRM remains private behind NestJS; never proxy arbitrary client coordinates.
- Mobile-own and authorized dispatcher route endpoints must use the same route
  builder, stop order, GeoJSON geometry, and deterministic plan identifier.
  Keep all active orders in `stops`; `nextWaypoints` is only a three-point
  navigation projection. Do not claim live traffic or closure awareness without
  a trusted dynamic restriction source applied by the backend routing layer.
- Accepted/stopped courier GPS points are pushed only to role-authorized
  dispatch clients through SSE. Stream events contain courier ID and location,
  never customer/order payloads; snapshots recover initial/reconnected state.
- Use the order `version` field for optimistic concurrency on every status,
  cancellation, assignment, and administrator-edit mutation.
- Record every successful state change in `OrderTransition`.
- `ADMIN`/`SUPER_ADMIN` may recover an active unsettled order through
  `admin-complete` when the real courier could not use the app. Require a
  detailed reason and confirmation of delivery plus receipt of the full total.
  Preserve its assigned courier, or require a real active courier if missing.
  Atomically create `CASH_RETURNED`, one cash settlement, loyalty credit when
  not yet delivered, the full transition reason and an administrator audit.
- A successfully committed administrator cancellation must remain committed
  even if the workstation print agent is unavailable. Its subsequent receipt
  plan is typed as `CANCELLATION`, retains the snapshotted order lines and
  kitchen routes, and may be requested again for a manual retry.
- Cash remains order-specific:
  `DELIVERED → CASH_RETURNED → RECONCILED`; `CASH_RETURNED` is the completed
  order state. Accountants inspect orders through dedicated read-only accounting APIs,
  but cannot mutate or reconcile them individually. An administrator submits all confirmed settlements for one
  completed configured shift as a unique cash handoff; accountant confirmation
  atomically reconciles its settlements and orders. `SUPER_ADMIN` retains the
  audited emergency individual transition unless the order belongs to a packet.

## Data and transactions

- Prices, discounts, delivery fees, promo limits, and totals are calculated by
  the backend from current database data.
- Store immutable order snapshots for product names, unit prices, delivery
  address fields, and the assigned branch. The explicit audited administrator
  edit of an active pre-pickup order is the only allowed snapshot replacement.
- Assign every new order to the nearest active branch by Haversine distance
  from the selected address inside the order transaction. Fail with `409`
  when no active branch exists; never silently create an unassigned new order.
- Branch coordinates and availability are PostgreSQL data managed by admins,
  not environment configuration. Deactivation affects new assignment only and
  must not rewrite historical order snapshots.
- New or selected order addresses become active; the last used order address is
  the default for the next order.
- Multi-record writes use a Prisma transaction. Protect counters and state
  transitions with conditional updates, locks, or compare-and-swap semantics.
- Every Prisma schema change requires a checked-in migration. Never use
  destructive reset commands on a user database.

## Media and external services

- Accept only validated image content, enforce size limits, re-encode to WebP,
  use generated object names, and store objects in private S3-compatible
  storage.
- Local development uses MinIO; production uses S3/IAM-compatible credentials.
- Local SMS may use `console`; production uses the Android pull gateway. During
  the explicitly accepted temporary single-phone integration window its three
  device endpoints are tokenless with `SMS_GATEWAY_AUTH_REQUIRED=false`.
  Preserve and test the bearer guard so setting the flag to `true` restores
  device authentication without changing the queue protocol.
- Android pull jobs must be encrypted at rest, atomically leased to one device,
  acknowledged with the matching receipt, and cancelled against the original
  OTP request when delivery fails.
- Production Redis must use TLS and must not persist plaintext OTP data.

## Tests

- Unit-test complete policy matrices, including deny-by-default cases.
- HTTP e2e-test every critical workflow across allowed and forbidden roles.
- Add concurrency tests for one-time tokens and versioned order mutations.
- Use only the isolated `sacakly_test` database and Redis DB 15 in tests.
- A backend change is incomplete until lint, build, tests, coverage thresholds,
  and both development/production dependency audits pass.
