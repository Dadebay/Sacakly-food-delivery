# Saçakly change history

Append one dated entry for every pull request. Keep this file as a concise
index of what was actually changed and verified; `PROJECT_CONTEXT.md` remains
the authority for current business rules. Record the PR URL when available,
the affected surfaces, verification, migrations, and any release limitation.
Never put customer data, OTP values, agent tokens or other secrets here.

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
