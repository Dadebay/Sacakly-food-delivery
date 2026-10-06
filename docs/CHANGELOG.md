# Saçakly change history

Append one dated entry for every pull request. Keep this file as a concise
index of what was actually changed and verified; `PROJECT_CONTEXT.md` remains
the authority for current business rules. Record the PR URL when available,
the affected surfaces, verification, migrations, and any release limitation.
Never put customer data, OTP values, agent tokens or other secrets here.

## 2026-10-06 — Root monorepo workflow

- [PR #7](https://github.com/Guvanch99/sacakly-platform/pull/7): the root `dev`
  command now starts the Saçakly API, customer web and cafe/OWNER
  portal; `dev:legacy` keeps the imported admin workflow explicit. Added
  `setup:apps` for independent installs, made `test` cover all four JavaScript
  applications, removed duplicate test runs from `test:all`, and added `check`
  for lint, contract generation, builds and tests.
- Documented application boundaries and root commands in `docs/MONOREPO.md`
  and README. Individual pinned dependencies and lockfiles remain independent;
  no schema migration, API change or production deployment.
- CI exposed newly published dependency advisories. Pinned patched
  `source-map-js` 1.2.2 in API, imported admin and merchant lockfiles, and
  `proxy-addr` 2.0.8 in the API lockfile. Independent low-threshold npm audits
  now report zero vulnerabilities for each affected package boundary.
- Verified `setup:apps`, `check` (443 API tests, 203 legacy admin tests,
  2 merchant tests, 2 web tests) and root `dev` with HTTP 200 from API, web and
  merchant before the dependency pin update. After that update, all PR CI jobs
  passed, including API, browser E2E and audits. A repeated local `check` reached
  the API suite but was stopped after its worker stalled; the clean CI run is
  the verification for the final lockfiles. Local processes and Compose
  services were stopped after verification.
- Native customer/courier apps are still planned, and legacy API tenant
  scoping remains a release blocker.

## 2026-10-04 — Handoff for two mobile applications

- [PR #6](https://github.com/Guvanch99/sacakly-platform/pull/6): added Russian
  mobile handoff for separate customer and courier apps, with current API
  routes, screens, courier timing and claim rules, FCM integration, acceptance
  checks and explicit backend blockers. Linked the documents from the index
  and recorded the two-app architecture in project context.
- Documentation only. No schema migration, mobile release or production
  deployment. Verification: checked routes, DTOs, Prisma enums and order policy
  against the API source; Markdown links and `git diff --check` checked locally.
- Full native release still requires tenant-safe assigned-order and tracking
  APIs, courier availability/workflow, and the customer history cafe snapshot.

## 2026-10-04 — Browser E2E and mandatory PR history

- [PR #6](https://github.com/Guvanch99/sacakly-platform/pull/6), branch
  `codex/courier-retry-cafe-receipts`.
- Added Chromium Playwright journeys through the real local Next.js website,
  merchant portal and NestJS API on isolated `sacakly_test`/Redis DB 15.
  Coverage includes one-cafe basket switching, OTP checkout, automatic network
  delivery request, cross-cafe denial, cafe printer configuration, OWNER module
  activation, queue claim/failure/retry and mobile layout.
- Added a dedicated CI job for these journeys and a PR gate requiring a new
  change-history entry. No production deployment or schema migration.
- Local verification: 2 Playwright journeys passed; 443 API tests passed;
  API/web/merchant builds and lint passed; root and API dependency audits
  reported no vulnerabilities.
- Real Firebase delivery and physical receipt output still require separate
  integration and hardware acceptance checks.

## 2026-10-04 — Automatic dispatch, Firebase retry and cafe receipts

- [PR #6](https://github.com/Guvanch99/sacakly-platform/pull/6): automatically
  schedule the external courier network when a cafe has no active own courier;
  persist and retry direct FCM pushes; isolate printer settings, queue and
  agent credentials per cafe.
- Added three additive Prisma migrations, updated OpenAPI and the shared
  contract, and extended the merchant portal and print agent.
- Verified by 443 API tests, Go tests and passing API/admin/merchant/web CI.
  Physical printers were not tested in this environment.
