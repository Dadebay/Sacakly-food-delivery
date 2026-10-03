# Inventory workspace UX verification — 2026-09-14

https://a7-tagam.com.tm/meal-config

Проверить:
- Четыре вкладки: остатки, ингредиенты, рецептуры и бюджет меню. Прямая ссылка сохраняет выбранную вкладку и филиал.
- Пустой склад объясняет последовательность: ингредиент → приход → рецептура.
- Цена вводится за кг, литр или штуку. Приход и списание показывают остаток до/после, сохраняют основание и обновляют список.
- Рецептура показывает количество ингредиентов на весь выход и себестоимость порции; предупреждает о несохранённых изменениях при смене блюда/вкладки.
- Подбор меню рассчитывается сервером без создания заказа. При изменении состава/условий результат скрывается до пересчёта; советы по сокращению суммы требуют нового расчёта.
- Проверить desktop/mobile, поиск, пустые результаты, ошибки/повтор, клавиатуру, закрытие формы и возврат фокуса.

## Executed checks

Production Vite build served at `http://127.0.0.1:4328` against the real Nest
API at `127.0.0.1:4000`, using an isolated migrated PostgreSQL test database.
No production inventory/customer records were used or changed for browser QA.

- Admin lint: no errors; three existing warnings in the unchanged phone field.
- Admin build/typecheck and 172 tests passed, including five new conversion and
  validation tests (kg/litre/piece prices, thresholds, signed movements, zero,
  negative, overflow, precision and values smaller than storage precision).
- Full and production-only dependency audits: zero vulnerabilities.
- TypeScript import graph: 208 files, zero cycles.
- Chromium, Firefox and WebKit: desktop 1440 px and mobile 390 px. Real API
  ingredient create/edit, unit conversion, branch/status/name filters, receipt,
  writeoff, recipe saving/cost, over-budget and within-budget quotes passed.
- Lost-response test: the real server committed a receipt; the intercepted
  first response reported failure. Retrying reused the idempotency key and
  produced one stock increase, across all six browser configurations.
- Modal validation, Escape and focus restoration passed. A writeoff larger
  than the displayed stock is disabled; the backend remains authoritative.
- Controlled empty and 409 API responses verified onboarding, retry and input
  preservation. These visual/error fixtures were intercepted in the browser;
  successful mutation paths used the real API.
- All four views and dialogs checked for horizontal overflow at 320/768 px.
  Dialog centering, focus restoration and rejection of tiny prices checked in
  all six browser configurations after the final adjustment.
- No page runtime errors in the completed browser suites.

## Performance and cache behavior

- Local production-build ready times: 422–591 ms in the six browser runs.
- Chromium lab LCP: 516 ms; CLS: 0.00085. Recorded main-thread long tasks were
  70 ms and 231 ms during startup/observation. This is a local lab sample,
  not production p75 Core Web Vitals or a field INP measurement.
- One stock request per 16-second observation while mounted; zero stock
  requests during the same interval after switching tabs. The single global
  decrease feed made one request per interval. No duplicated polling loops.
- Bootstrap entry: 251.22 kB / 80.27 kB gzip, previously 251.19 / 80.26 kB.
  Workspace CSS grows from 1.16 to approximately 4.04 kB gzip. Ingredient,
  recipe and budget views are lazy-loaded and mounted only when selected.

Reproducible browser scripts, screenshots, build/test/audit logs and JSON
measurements are retained with the local release evidence under
`outputs/inventory-ux-20260913/`; test session credentials are removed at handoff.

Business rules, role authorization, cancellation/return behavior, database
schema and generated API contract are unchanged by this UI release.
