# Saçakly customer web instructions

The Next.js App Router composes pages in `src/app/`. Product code uses FSD
layers `widgets → features → entities → shared`; lower layers never import
higher layers. The only network transport lives in `src/shared/api.ts` and
uses the generated `@sacakly/api-contract` schema. Server rendering may only
use public API calls. Customer tokens stay in the browser session and never
appear in page metadata, sitemap, or static caches.

The API owns cafe isolation, prices, delivery fees, OTP, courier approval,
claim races, and order transitions. The browser basket is a convenience only.
Never index checkout or draft pages. The service worker caches only immutable
static assets; it must not cache API, authenticated HTML, orders, or tokens.
Run lint, build, tests, audit, then verify the running app after edits.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
