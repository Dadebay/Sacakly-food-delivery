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
- [x] Cafe-scoped category, fixed-price product and branch editing in the merchant portal with version conflicts and audit.
- [x] Existing receipt print pipeline identified; marketplace orders are kept out of its global queue until tenant-specific workers are implemented.
- [x] New HTTP boundary tests and client tests; source API/admin tests, builds and dependency audits run locally.

## Required before onboarding independent cafes

1. **Tenant catalog and kitchen.** Extend the new cafe-scoped editor to variants, media and translated content. Add order acceptance and cooking actions, and authorization tests for every cross-cafe ID. Scope the legacy operations API or remove it from the platform release.
2. **Cafe receipts.** Add cafe-owned printers, per-cafe queue and station credentials, a separate claim/ack scope, main and kitchen routes, and cancellation/retry handling. Test that neither a legacy agent nor another cafe can view or claim a task. Reuse the imported print plan and durable task rules. Only then allow the RECEIPTS module to be activated.
3. **Courier operations.** Add courier availability/shift data, platform-wide dispatch map and status workflow, merchant pickup details for assigned couriers only, durable notification retry and customer tracking. Preserve the existing order state machine and audited assignment.
4. **Customer experience.** Update the existing native customer application to browse many cafes, select one cafe, reset or separate the cart when switching cafes, quote, checkout, and show the chosen cafe on the order. Ensure old mixed-cafe checkout routes cannot create new platform orders. Improve the web map/address picker and expose own-order tracking.
5. **Accounting and inventory.** Scope stock, cash settlement, reports, promos and loyalty by cafe or explicitly define platform-level ownership. Agree commission, payout and refund rules before coding payments.
6. **Migration of the two current cafes.** Reconcile branches, products, printer routes, staff and historical mixed-cafe orders. Do not assign legacy money or receipts to a new tenant automatically. Test a dry-run migration and rollback against a copy of data.
7. **Release.** Provision separate infrastructure, secrets, domain, backups, observability and CI deployment. Run cross-tenant, load, mobile, print-agent and restore checks before public launch.

For every production-impacting mutation, write an allowed-role and a forbidden-role test, include a cross-cafe case, validate input, handle version conflicts and record audit/history. Generate the API contract after changing controllers or DTOs. Keep each cafe's module disabled until its behavior and data boundary have been verified.
