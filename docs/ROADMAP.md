# Saçakly delivery plan

The new repository is a migration project. A checked box means the behavior is implemented and verified in this repository; it does not imply that the whole platform is ready for independent cafes.

## Foundation completed

- [x] Private independent monorepo imported from a clean A7 source commit; A7 deployment workflows removed.
- [x] Cafe membership, OWNER entitlement, module entitlement, courier application, and cafe snapshots added with an additive Prisma migration.
- [x] OWNER can create a cafe, connect/revoke an existing user by phone, activate tenant-ready ordering, review courier applications, and assign an approved courier to a ready order across cafes.
- [x] New checkout and quote require products from one cafe and a branch belonging to that cafe.
- [x] Separate merchant/OWNER web portal with OTP login and server-protected order lists.
- [x] Next.js customer website with one-cafe basket, web OTP/checkout, three languages, PWA static shell and SEO routes.
- [x] OWNER page editor with localized content, SEO fields, draft/publish, version checks and audit.
- [x] Cafe manager delivery choice: own courier reservation or time-scheduled external offers. The first external claim wins atomically; assignment follows packing confirmation.
- [x] New orders with no active own cafe courier automatically schedule the external offer; timed Firebase pushes persist and retry transient failures without resending successful device tokens.
- [x] Cafe-scoped category, fixed-price product and branch editing in the merchant portal with version conflicts and audit.
- [x] Cafe-owned receipt printers, main and kitchen routes, separate agent tokens, queue isolation, manual reprint, cancellation and retry; legacy workers cannot claim cafe tasks.
- [x] Cuisine tags and server-side cafe filtering; OWNER cafe profile editor, draft readiness checklist and publication gate. Cafe ADMIN can configure branches, menu and receipts before ORDERING is enabled.
- [x] Cafe-scoped operational order and cash report for ADMIN/ACCOUNTANT, with bounded local-date periods and cross-cafe authorization tests.
- [x] Cafe-scoped automatic discounts and promo codes, per-cafe points/gifts with module controls, transactional limits, delivery earning and cancellation refunds; merchant and tk/ru/en checkout interfaces.
- [x] New HTTP boundary tests and client tests; source API/admin tests, builds and dependency audits run locally.
- [x] Chromium Playwright E2E checks exercise the customer website, merchant portal and real local API, including checkout, cafe isolation, automatic external delivery and receipt queue setup. CI requires this suite and a dated PR history entry.

## Required before onboarding independent cafes

1. **Tenant catalog and kitchen.** Extend the new cafe-scoped editor to variants, media and translated content. Add order acceptance and cooking actions, and authorization tests for every cross-cafe ID. Scope the legacy operations API or remove it from the platform release.
2. **Cafe receipt acceptance.** Verify the cafe print-agent build and both main/kitchen printers with real hardware in each cafe before enabling RECEIPTS there. Test paper output, network loss, journal replay and cancellation on site; the software boundary is implemented, but hardware delivery is not certified here.
3. **Courier operations.** Add courier availability/shift data, platform-wide dispatch map and status workflow, merchant pickup details for assigned couriers only, and customer tracking. Preserve the existing order state machine and audited assignment.
4. **Customer experience.** Update the existing native customer application to browse many cafes, select one cafe, reset or separate the cart when switching cafes, quote, checkout, and show the chosen cafe on the order. Ensure old mixed-cafe checkout routes cannot create new platform orders. Improve the web map/address picker and expose own-order tracking.
5. **Accounting and inventory.** The first private order/cash overview is implemented. Scope stock, cash settlement, full financial reports by cafe. Cafe promotions and loyalty are implemented; no shared platform wallet is defined. Agree commission, payout and refund rules before coding payments.
6. **Migration of the two current cafes.** Reconcile branches, products, printer routes, staff and historical mixed-cafe orders. Do not assign legacy money or receipts to a new tenant automatically. Test a dry-run migration and rollback against a copy of data.
7. **Release.** Provision separate infrastructure, secrets, domain, backups, observability and CI deployment. Run cross-tenant, load, mobile, print-agent and restore checks before public launch.

For every production-impacting mutation, write an allowed-role and a forbidden-role test, include a cross-cafe case, validate input, handle version conflicts and record audit/history. Generate the API contract after changing controllers or DTOs. Keep each cafe's module disabled until its behavior and data boundary have been verified.
