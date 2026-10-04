# React admin instructions

These rules apply to the pure React/Vite SPA under `apps/admin/`. Bootstrap,
route selection, providers, and global styles live in `src/app/`; product code
lives in the other `src/` FSD layers. The admin has no SSR or React Server
Components. Its server image is static Nginx only.

## Current integrated state

`src/app/ui/app.tsx` is a thin SPA route composition layer. Remote orders,
catalog, marketing, staff, cash workflow, and courier tracking live in their
FSD slices and use the real API through TanStack Query. Do not move domain
behavior into the bootstrap or reintroduce local demo arrays.

## Target FSD structure

Keep SPA bootstrap and provider composition in `src/app/`. Put product code in:

```text
src/
├── app/           # bootstrap, route composition, providers, global styles
├── widgets/       # composed admin sections: order board, map, navigation
├── features/      # user actions: transition, cancel, assign, edit, upload
├── entities/      # order, courier, product, promo, staff domain UI/model
└── shared/        # generated API, HTTP client, query client, UI primitives
```

Allowed dependency direction:

```text
app → widgets → features → entities → shared
```

A lower layer must never import from a higher layer. Cross-slice imports must
use the slice public API rather than another slice's internal files. Keep the
SPA bootstrap thin: route composition and provider wiring only.

## Server state and API

- Before installing TanStack packages, verify the latest stable releases that
  are compatible with the current React/Vite stack, then pin exact versions.
  Do not copy the older TanStack Query v4 versions from NEM.
- Use TanStack Query for all backend state: orders, couriers, catalog, banners,
  promos, staff, addresses, authentication mutations, and media metadata.
- Use a single `QueryClient` provider and centralized query-key factories.
- Keep query functions and mutations next to the owning entity/feature.
- After a mutation, update or invalidate the smallest relevant query set.
- Use optimistic updates only when rollback is deterministic; otherwise wait
  for the server response and show pending state.
- Courier GPS uses the authenticated dispatch SSE stream to update the existing
  TanStack Query cache. Its slower snapshot poll is reconnect recovery, not a
  second live-state owner. Do not create competing polling or event loops.
- A selected courier route comes from the role-protected dispatcher route API.
  Invalidate that exact TanStack query on a courier GPS event and render its
  GeoJSON geometry; never join order markers into a frontend-made route.
- Never copy server data into component state just to filter or render it.
- Pass TanStack Query's `AbortSignal` into every cancellable HTTP request.
- Set `staleTime`, `gcTime`, retry behavior, polling, and focus refetching from
  each domain's freshness needs instead of relying on global defaults.
- Poll the live order queue only while the relevant view is mounted and
  visible; never poll completed/history data at the live-queue rate.
- Use `select` for stable query projections and prefetch predictable detail
  views when it improves a measured navigation path.
- Use the Swagger-generated TypeScript contract. Do not hand-write duplicate
  API response types or silently cast responses to `any`.
- Import generated types only from the local `@sacakly/api-contract` package;
  never introduce a second generated schema inside the admin.
- Keep one HTTP client responsible for base URL, bearer token attachment,
  refresh serialization, normalized errors, and request cancellation.

## Tables

- Use TanStack Table for orders, staff, products, promos, and cash settlement
  lists.
- Prefer server-side pagination, filtering, and sorting for growing datasets.
- Configure `manualPagination`, `manualFiltering`, and `manualSorting` when the
  API owns those operations; do not load an entire dataset to imitate them.
- Keep column definitions in the owning entity/widget, not inside a route.
- Keep table data and column definitions referentially stable. Memoize them
  when TanStack Table or a measured render path requires stable references.
- Add row virtualization only for a measured large-list bottleneck; prefer
  server pagination first and TanStack Virtual when virtualization is needed.
- Derive visible actions from the authenticated role for usability, but always
  treat backend authorization as final.
- Preserve accessible table headers, keyboard actions, loading/empty/error
  states, and a responsive small-screen representation.

## State ownership

- TanStack Query: remote/server state.
- Component state: transient UI such as an open modal, selected row, or input.
- URL search params: shareable filters, pagination, and selected status.
- Introduce Zustand only for genuinely cross-route client state that cannot be
  derived from the URL, auth session, or query cache.
- Never keep access control, prices, totals, or workflow truth in a client
  store.

## UI and forms

- Break large screens into widgets and feature actions before adding behavior.
- Use React Hook Form with `zodResolver` for every HTML form. Keep each Zod
  schema in the owning feature/widget `model/`, infer its input/output types,
  and submit the resolver output to generated OpenAPI mutation types.
- Use shared helpers from `src/shared/forms`; do not create a second validation
  library or parse browser `FormData` manually. `FormData` is allowed only in
  the S3 multipart transport after form validation.
- Keep local component state only for custom non-native inputs such as map
  marker coordinates and ordered image previews, and combine it with validated
  form output at submit time.
- Every async screen needs loading, empty, error, retry, pending, and success
  feedback.
- Disable duplicate mutation submissions and surface `409 Conflict` as a
  reload/retry instruction.
- Keep role and status labels centralized and exhaustive so new enum values
  fail TypeScript checks.
- Do not expose development OTP codes, tokens, or provider details in
  production UI.

## React performance contract

- Keep the Vite bootstrap and initial route chunk small. There is no SSR,
  hydration, or React Server Component runtime.
- Do not fetch server data from `useEffect`. Use TanStack Query for remote
  server state.
- Split heavy maps, charts, editors, routes, and rarely opened management
  flows with `React.lazy` and dynamic imports. Do not put them in the initial
  order-board bundle.
- Keep fast-changing state close to the component that owns it. Avoid a context
  provider whose value changes on every keystroke or order update.
- Use stable row keys from backend IDs. Never use array indexes for mutable
  orders, products, staff, or courier stops.
- Do not add `useMemo`, `useCallback`, or `React.memo` everywhere. Use them when
  required for stable library inputs or when profiling shows avoided expensive
  work.
- Use `useTransition`/`startTransition` for non-urgent table and filter updates,
  and `useDeferredValue` only for expensive local projections. Debounce remote
  search at the query/URL boundary.
- Avoid maintaining the same optimistic state in both React
  `useOptimistic` and TanStack Query. The query cache is the source of truth for
  server mutations.
- Use route/widget-level Suspense and error boundaries so one slow query does
  not block or crash the entire dashboard.
- Use optimized image dimensions and lazy loading for catalog/banner media.
  Prevent layout shifts by reserving the rendered dimensions.
- Do not perform route planning, large sorting, image processing, or other
  heavy computation during React render. Move it to the backend or an isolated
  worker when client execution is genuinely required.

## Performance verification

- Treat performance as a tested non-functional requirement, not a subjective
  code-style claim.
- Target production p75 Core Web Vitals of LCP under 2.5 seconds, INP under
  200 milliseconds, and CLS under 0.1 on supported admin devices.
- Profile the production build after changes to providers, the order board,
  tables, maps, or generated-client plumbing.
- Check that updating one order does not rerender every unrelated table row.
- Check for duplicate HTTP requests, duplicated polling loops, cache-key
  collisions, and request waterfalls.
- Record and explain any meaningful initial-JavaScript or interaction
  regression. Prefer removing work over adding memoization blindly.

## Frontend completion checklist

- The screen reads and writes through the real API.
- Query caching/invalidation behavior is tested.
- TanStack Table state maps correctly to API pagination/filter parameters.
- Role-sensitive actions are hidden or disabled appropriately, and forbidden
  backend responses are handled.
- OpenAPI types are current.
- The production path meets the performance contract or documents a measured
  blocker and follow-up.
- Lint, production build, UI tests, and dependency audit pass.
