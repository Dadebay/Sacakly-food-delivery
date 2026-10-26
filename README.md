# Saçakly

Saçakly is a multi-cafe food delivery platform: a marketplace of independent
cafes served by a shared courier network. Customers order from a mobile app or
the web, cafes manage their own menus and orders in a merchant portal, and
couriers pick up deliveries across cafes.

> **Status:** early foundation, not a production-ready multi-tenant service.
> Some legacy endpoints and the imported admin app still need per-cafe scoping.
> See [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) for the current business
> rules and limitations.

## Features

- **Multi-cafe ordering** – every order belongs to exactly one cafe; catalog
  items, branches, staff and printers are scoped to that cafe.
- **Server-side authority** – the API owns tenant authorization, pricing, order
  state, courier assignment, module entitlements, receipts and audit.
- **Platform OWNER** – OTP-authenticated owner account that creates cafes,
  grants cafe access, enables modules and reviews courier applications.
- **Courier network** – cafe-owned couriers or timed offers to external
  couriers, with first-claim reservation and push notifications.
- **Merchant portal** – cafe-scoped categories, dishes, branches, discounts,
  promotions and loyalty points.
- **Receipt printing** – per-cafe printers, kitchen routes and a print agent.
- **Customer apps** – multilingual website (Turkmen, Russian, English) and a
  Flutter mobile app for Android and iOS.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/api` | NestJS API with Prisma, PostgreSQL, Redis, SMS and S3 |
| `apps/merchant` | React/Vite portal for cafes and the platform OWNER |
| `apps/web` | Next.js customer website (PWA, SEO, multilingual) |
| `apps/customer` | Flutter customer mobile app |
| `apps/admin` | Imported single-operator admin SPA (migration target) |
| `apps/print-agent` | Receipt print bridge |
| `packages/api-contract` | TypeScript API contract generated from Swagger |
| `docs/` | Project documentation, see [docs/INDEX.md](docs/INDEX.md) |

Each app pins its own dependencies and keeps its own npm lockfile; the root
scripts orchestrate them without npm workspaces.

## Getting started

Requirements: Node.js 24, Docker, and Flutter for the mobile app.

```bash
npm ci
npm run setup:apps
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait postgres redis minio
node apps/api/scripts/init-local-s3.mjs
npm --prefix apps/api run db:deploy
npm --prefix apps/api run db:seed:marketplace-demo   # optional, local database only
npm run api:client
npm run dev
```

Local addresses:

- API: <http://localhost:4000>
- Customer website: <http://localhost:3000>
- Merchant portal: <http://localhost:5174>

To run the mobile app against the local API with a connected Android device,
use `./run-customer.sh`. See [docs/CUSTOMER_FLUTTER.md](docs/CUSTOMER_FLUTTER.md).

Use isolated local data only. Never point this repository at production data
or deployment secrets.

## Verification

```bash
npm run check       # lint, contract regeneration, builds and app tests
npm run test:all    # app tests, print-agent tests and browser E2E
```

API and Playwright tests recreate an isolated `sacakly_test` database and apply
all migrations. Never run them against a production database.

## Documentation

- [Overview](docs/OVERVIEW.md)
- [Project context](docs/PROJECT_CONTEXT.md)
- [Customer Flutter app](docs/CUSTOMER_FLUTTER.md)
- [Maps](docs/MAPS.md) and [routing](docs/ROUTING.md)
- [Print agent](docs/PRINT_AGENT.md)
- [Change history](docs/CHANGELOG.md)
