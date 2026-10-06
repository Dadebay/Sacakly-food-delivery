# Browser E2E checks

`npm run test:e2e` builds the API, recreates **only** the local
`sacakly_test` PostgreSQL database, flushes Redis DB 15, applies migrations,
seeds two test cafes and starts the API, customer web and merchant portal.
The setup refuses production hosts and any database name other than
`sacakly_test`. Do not run it while another test process uses that database.

Before running locally:

```bash
docker compose up -d --wait postgres redis minio
node apps/api/scripts/init-local-s3.mjs
npx playwright install chromium
npm run test:e2e
docker compose down
```

The suite runs Chromium on desktop and explicitly checks the customer site at
mobile width. It uses local-only test OTP accounts, a non-delivering console
SMS/push provider and fake private printer addresses. The tested path crosses
real browser pages and the real NestJS API; the server owns totals, tenant
access, delivery schedule and receipt queue state. It never sends a real SMS,
FCM message or print command. Failure traces remain ignored under
`test-results/`. CI runs the same suite in an isolated Docker job.

For a new feature, add a focused browser assertion where visual interaction
or cross-app coordination matters; keep authorization, race and transition
matrices in API tests. Record new coverage and remaining external acceptance
work in `CHANGELOG.md` in the same PR.
