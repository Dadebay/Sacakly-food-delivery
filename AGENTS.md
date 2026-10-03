# AlowLink Platform repository instructions

Read docs/PROJECT_CONTEXT.md, docs/INFRASTRUCTURE.md, and the nearest
apps/*/AGENTS.md before changing code. Inspect git status first.

This repository is an independent multi-cafe platform. The imported A7-tagam
code is a compatibility baseline, not a safe multi-tenant service. Never point
this repository at A7 production data or deployment secrets. Archived
single-operator decisions are in docs/legacy/PROJECT_CONTEXT.md.

The API owns tenant authorization, pricing, order state, courier assignment,
module entitlements, receipts and audit. Client filters are never security.
A new order belongs to exactly one cafe. Catalog items, merchant users,
branches, printer routes and order lookups must be constrained to that cafe.
Preserve historical mixed-cafe orders during migration.

Platform OWNER is an OTP-authenticated account bound to the configured phone
and persisted entitlement. Matching a phone alone is not an authentication
bypass. Reuse the single Prisma Role enum and orders/order-policy.ts state
machine. Add additive migrations and allowed/forbidden tests. Never hand-edit
generated Prisma, OpenAPI or contract files. Keep dependency versions exact
and each npm lockfile independent.

For backend changes run lint, build, tests and audit under apps/api. For API
contract changes run npm run api:client; for frontend changes run lint, tests
and audit under the affected app. Verify migrations on an isolated database.

No production deployment workflow exists here until an isolated environment,
secrets, data migration and rollback plan are approved. Do not reuse archived
A7 production scripts or its GitHub Environment.
