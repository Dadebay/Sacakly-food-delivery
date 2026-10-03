https://a7-tagam.com.tm/delivery — delivery settings
https://a7-tagam.com.tm/orders — manual receipt dialog

Проверить:
- Настройки доставки видны сверху: выбор улиц/районов или километров, дневная и ночная цена за км, расписание ночного тарифа.
- По километрам настройки районов показаны как неактивные. Возврат к районному тарифу сохраняет ранее настроенные цены.
- Улицы без контура присутствуют в общем списке, находятся через поиск и открываются для редактирования. На карте остаются только реальные контуры.
- В печати заказа можно выключить главный чек или выбрать 1, 2, 3 копии; галочка исключает блюдо из всех чеков данной ручной печати.
- При выключенном главном чеке включённому блюду нужен кухонный аппарат. Пустой или противоречивый выбор не должен отменять ожидающие автоматические задания.
- Длинный заказ на desktop/mobile: прокрутка блюд внутри окна, главная касса и кнопки видны; Escape закрывает окно и возвращает фокус на кнопку печати.

## Verification, 2026-09-26

TDD: failing API/form/browser tests were run before implementation. They
reproduced missing copy controls, the submit button below the viewport, hidden
pricing settings and missing street rows. Then the implementation made them pass.

- API: 367 tests / 41 files pass, including copy counts, invalid/null/fractional
  values, authorization, changed-key conflicts, no kitchen destination, queue
  cancellation and legacy requests. Coverage: statements 91.60%, branches 79.40%,
  functions 93.17%, lines 92.77%. Lint/build pass.
- Admin: 202 tests pass, typecheck/production build/lint pass. Three pre-existing
  Fast Refresh warnings remain in the shared phone field.
- Playwright: 54 cases covered on production preview in headless Chromium,
  Firefox and WebKit, 1440×900 and 390×844. The initial run passed 52 cases;
  two Firefox navigation timeouts during a simultaneous rebuild passed after
  the build finished. Production build must finish before starting preview QA.
  Console assertions then passed for all 30 print cases and all 24 delivery/shop
  cases. The fixture now provides local map tiles and a valid PNG to avoid
  missing local tile-server errors and Firefox's corrupt-image fixture warning.
- One unrelated address API test returned 400 on the initial full run; its
  isolated rerun and the following full coverage run passed. No address logic
  was changed by this fix.
- Existing print-agent Go tests pass.
- All development and production dependency audits report zero vulnerabilities.
- Frontend hygiene scan and generated API contract check pass.

For a 50-line order, each browser made one print-plan request and one printer
request. Unchecking the last dish including Playwright's assertion took
48–77 ms (local lab measurement, not field INP). The entry JavaScript remains
255.11 kB / 81.07 kB gzip; main CSS changed from 214.04 / 38.04 kB gzip to
216.50 / 38.51 kB gzip. No extra polling or runtime dependencies were added.

Reproduce functional checks:

```sh
npm --prefix apps/api test
npm --prefix apps/admin test
npm --prefix apps/admin run test:playwright -- manual-print.spec.ts loyalty-delivery.spec.ts
```

Local evidence is retained in ignored `outputs/print-delivery-ui-20260926/`.
Browser cases use API fixtures; HTTP integration tests use isolated PostgreSQL,
Redis and S3. Physical printers were not triggered during verification. Existing
print-agent binaries keep the same queue protocol; no database migration is
needed for this change.
