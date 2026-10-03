# Development notes — 2026-10-03

## Implemented

- Imported the clean AlowAlow source into a new AlowLink monorepo; archived old context and deployment scripts.
- Added protected marketplace/OWNER/courier APIs, additive Prisma migration, one-cafe order path and a separate merchant portal.
- Kept marketplace orders out of the shared legacy receipt queue; printed cafe receipts remain a release blocker.

## Verification

- API lint, build and generated OpenAPI/TypeScript contract passed.
- API e2e tests apply migrations to an isolated PostgreSQL test database. The full run passed 431 tests in 46 files with 91.14% statement coverage. New tests cover owner OTP entitlement, cafe membership, module limits, one-cafe checkout, courier approval and cross-cafe dispatch.
- The additive migration applied to the isolated local PostgreSQL database.
- Merchant lint, TypeScript/Vite build, two API-client tests and dependency audit passed.
- Imported admin lint, Vite build, 203 tests and dependency audit passed. Existing lint has three Fast Refresh warnings in an unchanged file.
- Merchant login page inspected in a browser at mobile and desktop widths; no browser console warnings or errors were observed.
- Earlier full API runs intermittently failed in imported security/inventory HTTP tests under local load; both failed files passed when rerun individually, and the final full run passed. CI may expose this legacy test instability.

## Known release blockers

- Legacy admin endpoints, catalog/kitchen, accounting, inventory and print-agent routes are not tenant-isolated.
- Only ORDERING can be activated in the new module system. The other keys are reserved.
- The merchant portal lists orders but has no tenant-scoped kitchen or printer actions yet.
- Customer and courier applications, merchant desktop packaging, cafe migration and production deployment are not included in this foundation.
