# Saçakly monorepo

All platform code lives in one Git repository. The root `package.json` runs the applications together; it does **not** own their dependency trees. Each JavaScript application keeps its own exact dependency versions and `package-lock.json`, so updating one app cannot silently change another app's security overrides.

| Path | Role |
| --- | --- |
| `apps/api` | NestJS API, Prisma schema and migrations, server-owned business rules |
| `apps/web` | Next.js customer website and PWA |
| `apps/merchant` | Cafe management and platform OWNER web portal |
| `apps/admin` | Imported A7 operations SPA; migration target, not the new cafe portal |
| `apps/print-agent` | Go bridge for cafe receipt printers |
| `apps/desktop` | Imported workstation source; not a Saçakly release |
| `packages/api-contract` | Generated TypeScript contract from API Swagger |
| `docs/mobile` | Handoff for planned customer and courier native apps; no native code yet |

## Install and run

Use Node.js 24 and isolated local services. From the repository root:

```bash
npm ci
npm run setup:apps
cp apps/api/.env.example apps/api/.env # first time only; configure isolated local values
docker compose up -d --wait postgres redis minio
node apps/api/scripts/init-local-s3.mjs
npm --prefix apps/api run db:deploy
npm run api:client
npm run dev
```

`npm run dev` starts API (4000), customer web (3000) and cafe/OWNER portal (5174). `npm run dev:legacy` starts only the imported A7 admin and API. The individual `dev:api`, `dev:web`, `dev:merchant` and `dev:admin` commands remain available. Stop local processes and Compose services after development unless needed for ongoing work.

## Build and verify

```bash
npm run lint       # API, imported admin, merchant portal, customer web
npm run build      # regenerate API contract, then build all JavaScript apps
npm test           # tests in all four JavaScript apps
npm run check      # lint + build + tests
npm run test:all   # above app tests plus Go print-agent and browser E2E
```

API and browser tests need the isolated local PostgreSQL/Redis/MinIO services; the browser suite also needs Chromium. See [browser E2E](PLAYWRIGHT_E2E.md). CI runs the application checks in separate jobs and the browser suite against an isolated test database. `npm run api:client` is required after API controller/DTO changes; never edit `apps/api/openapi.json` or `packages/api-contract/src/schema.ts` manually.

Do not run this repository against the original A7 production database or credentials. No Saçakly production deployment is configured. See [infrastructure](INFRASTRUCTURE.md) and [roadmap](ROADMAP.md).
