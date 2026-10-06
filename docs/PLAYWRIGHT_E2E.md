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

CI runs Chromium on desktop and checks the customer site, cafe setup and OWNER
console at a 390 × 844 mobile viewport. The main journey also creates a draft
cafe, grants its administrator, fills its menu and branch through the portal,
then publishes it through OWNER and checks the cuisine filter. Cafe reports,
receipt configuration before publication and tenant boundaries use the real API.
The rewards journey enables MARKETING/LOYALTY through OWNER, creates automatic
and code discounts plus gifts in the cafe portal, checks automatic versus explicit
pricing, wallet isolation, quote invalidation, redemption and gift packing.
Fixtures include two different cafe balances for one test customer; HTTP API
coverage separately verifies actual earning, redemption races and refunds. It uses local-only test OTP accounts, a non-delivering console
SMS/push provider and fake private printer addresses. The tested path crosses
real browser pages and the real NestJS API; the server owns totals, tenant
access, delivery schedule and receipt queue state. It never sends a real SMS,
FCM message or print command. Failure traces remain ignored under
`test-results/`. CI runs the same suite in an isolated Docker job.

For a new feature, add a focused browser assertion where visual interaction
or cross-app coordination matters; keep authorization, race and transition
matrices in API tests. Record new coverage and remaining external acceptance
work in `CHANGELOG.md` in the same PR.

## Additional local browsers

Run each browser separately: the journey mutates shared fixtures, so every
run needs its own preparation. Install the chosen Playwright browser first.

```bash
npx playwright install firefox webkit
npm run test:e2e -- --browser=firefox
npm run test:e2e -- --browser=webkit
```

When another project uses Redis port 6379, start a dedicated test Redis at
6381 and prefix the command with
`TEST_REDIS_URL=redis://127.0.0.1:6381/15`. Never use another project's Redis
instance: fixture preparation clears DB 15. Playwright WebKit is an engine
check, not verification on physical Safari/iOS devices.
