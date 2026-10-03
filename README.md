# AlowLink

AlowLink is a private monorepo for a marketplace of independent cafes and a shared courier network. It starts from the clean `origin/main` snapshot of AlowAlow (`0eb18f7`). The original checkout, data, and deployment remain separate.

## Current implementation

- NestJS API and PostgreSQL/Prisma models for cafe memberships, module entitlements, courier applications, and the platform OWNER.
- One-cafe quote and checkout, with cafe and branch snapshots on new orders. Existing pricing and order transitions are reused.
- OWNER API to create a cafe, find an existing user by phone, grant/revoke versioned cafe access, activate the tenant-ready ORDERING module, review courier applications, and dispatch approved couriers across cafes.
- Separate React/Vite merchant and OWNER portal in `apps/merchant`; it uses the generated API contract and protected API calls.
- The imported durable order receipt queue and print agent remain the basis for receipts. New cafe orders are gated out of the legacy shared queue until per-cafe print credentials and routes exist. No fiscal receipt provider was added.
- API and UI tests for the new boundaries; CI has no production deployment permissions.

**Release status:** This is a foundation, not a production-ready multi-tenant marketplace. The imported `apps/admin` and other legacy endpoints still need cafe scoping. Printer routes, accounting, inventory, courier shifts, merchant kitchen actions, and the customer application need tenant-aware integration and end-to-end validation before independent cafes can join. See [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) and [ROADMAP.md](docs/ROADMAP.md).

## Monorepo

| Path | Purpose |
| --- | --- |
| `apps/api` | NestJS API, Prisma, PostgreSQL, Redis, SMS, S3 |
| `apps/merchant` | Separate cafe and platform OWNER web portal |
| `apps/admin` | Imported single-operator SPA; migration target |
| `apps/print-agent` | Imported receipt print bridge |
| `packages/api-contract` | Generated TypeScript contract from Swagger |
| `docs/legacy` | Original AlowAlow context, deployment notes, and README |

Each app keeps its own pinned npm dependencies and lockfile. Node.js 24 and Docker are used for local verification.

## Local development

```bash
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/merchant
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait postgres redis minio
docker compose run --rm minio-init
npm --prefix apps/api run db:deploy
npm run api:client
npm run dev:api
npm run dev:merchant
```

The API listens on `http://localhost:4000`; the merchant portal on `http://localhost:5174`. The two `dev` commands run in separate terminals. Use only isolated local data. The repository contains no new platform production deployment.

The platform OWNER phone is `+99362969614`. Its first successful OTP sign-in in the new platform database creates an audited owner entitlement and sets the current user role to `SUPER_ADMIN`. The protected OWNER API checks both the current authenticated account and the persisted entitlement. A disabled entitlement is not restored by another login.

## Verification

```bash
npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/api test
npm --prefix apps/api audit --audit-level=low
npm --prefix apps/merchant run lint
npm --prefix apps/merchant run build
npm --prefix apps/merchant test
npm --prefix apps/merchant audit --audit-level=low
```

The API test setup recreates an isolated `alofood_test` database and applies all migrations. Never run it against a production database.
