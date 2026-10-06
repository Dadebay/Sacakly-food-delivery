# Saçakly

Saçakly is a private monorepo for a marketplace of independent cafes and a shared courier network. It starts from a clean snapshot of the original single-operator project (`0eb18f7`). The original checkout, data, and deployment remain separate.

## Current implementation

- NestJS API and PostgreSQL/Prisma models for cafe memberships, module entitlements, courier applications, and the platform OWNER.
- One-cafe quote and checkout, with cafe and branch snapshots on new orders. Existing pricing and order transitions are reused.
- OWNER API to create a cafe, find an existing user by phone, grant/revoke versioned cafe access, activate the tenant-ready ORDERING module, review courier applications, and dispatch approved couriers across cafes.
- Separate React/Vite merchant and OWNER portal in `apps/merchant`; it uses the generated API contract and protected API calls.
- Next.js customer website in `apps/web`: Turkmen/Russian/English, web checkout, public cafes, courier offers, PWA shell and SEO metadata.
- OWNER-managed localized pages and SEO fields with draft/publish, version conflicts and audit.
- Cafe-owned couriers or timed external network offers; orders without an active own courier enter the external route automatically. A 60-minute meal opens to network couriers after 20 minutes, with first-claim reservation and assignment after packing. Firebase direct pushes have a durable retry outbox.
- Cafe-scoped category, fixed-price dish and branch editing in the merchant portal with server permissions, version checks and audit.
- Cafe-owned printers, kitchen routes, agent tokens and an isolated receipt queue reuse the imported durable print engine. OWNER may activate RECEIPTS after a cafe configures a printer and token. No fiscal receipt provider was added.
- API, UI and real-stack Playwright browser tests for the new boundaries; CI has no production deployment permissions.

**Release status:** This is a foundation, not a production-ready multi-tenant marketplace. The imported `apps/admin` and other legacy endpoints still need cafe scoping. Accounting, inventory, courier shifts and every legacy mutation need tenant-aware integration before independent cafes can join. Cafe print output also needs real hardware acceptance. See [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md), [ROADMAP.md](docs/ROADMAP.md) and the [change history](docs/CHANGELOG.md).

## Monorepo

| Path | Purpose |
| --- | --- |
| `apps/api` | NestJS API, Prisma, PostgreSQL, Redis, SMS, S3 |
| `apps/merchant` | Separate cafe and platform OWNER web portal |
| `apps/web` | Next.js customer website, multilingual PWA and SEO |
| `apps/admin` | Imported single-operator SPA; migration target |
| `apps/print-agent` | Imported receipt print bridge |
| `packages/api-contract` | Generated TypeScript contract from Swagger |
| `docs/legacy` | Original single-operator context, deployment notes, and README |

Each app keeps its own pinned npm dependencies and lockfile. Node.js 24 and Docker are used for local verification.

## Local development

```bash
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/merchant
npm ci --prefix apps/web
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait postgres redis minio
node apps/api/scripts/init-local-s3.mjs
npm --prefix apps/api run db:deploy
npm --prefix apps/api run db:seed:marketplace-demo # optional, local database only
npm run api:client
npm run dev:api
npm run dev:merchant
npm run dev:web
```

The API listens on `http://localhost:4000`, the customer site on `http://localhost:3000`, and the merchant portal on `http://localhost:5174`. Run the three `dev` commands in separate terminals, or use `npm run dev:platform`. Use only isolated local data. The repository contains no new platform production deployment.

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
npm --prefix apps/web run lint
npm --prefix apps/web run build
npm --prefix apps/web test
npm --prefix apps/web audit --audit-level=low
npm run test:e2e # after local Docker services and Chromium are ready
```

The API and Playwright test setups recreate an isolated `sacakly_test` database and apply all migrations. Never run them against a production database. Follow [PLAYWRIGHT_E2E.md](docs/PLAYWRIGHT_E2E.md) for the browser setup. Every pull request adds a dated entry to [CHANGELOG.md](docs/CHANGELOG.md), enforced by CI.
