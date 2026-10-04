https://a7-tagam.com.tm/orders

Проверить:
- В доске раскрыть активный заказ или переключиться на таблицу: ADMIN и
  SUPER_ADMIN видят «Завершить заказ». Остальные роли этого действия не имеют.
- Реальный курьер ушёл без приложения: назначенный курьер сохраняется.
  Если назначения не было, выбрать действующего сотрудника «Курьер»;
  установка приложения ему не требуется. Замена назначенного курьера запрещена.
- Указать подробную причину (20–500 символов). Пустая/короткая причина,
  отсутствие подтверждения доставки и получения всей суммы блокируют отправку.
  Предупреждение показывает полную сумму с доставкой и требует сдачи денег админу.
- После успешной отправки заказ завершён, полная многострочная причина и
  администратор видны в истории. В смене появляется сумма еды без доставки;
  начисление баллов не дублируется для уже доставленного заказа.
- Повторное нажатие во время запроса недоступно; stale version возвращает 409,
  обновляет данные и требует заново открыть заказ. CANCELLED/CASH_RETURNED/
  RECONCILED повторно завершить нельзя. Escape/«Отмена» не изменяют заказ,
  фокус возвращается на кнопку открытия, Tab остаётся внутри диалога.
- Проверить desktop/mobile, перенос длинного текста, состояние загрузки/ошибки
  списка курьеров и кнопку повторной загрузки; страница не должна расширяться.

Automated verification on 2026-09-28:

- API: lint/build, 44 files / 417 tests, including the complete recovery role/
  status matrix, invalid input, missing/inactive/wrong-role courier, 500-character
  multiline reasons, rollback on ledger failure and concurrent completion.
  Coverage: statements 92.15%, branches 80.40%, functions 93.45%, lines 93.27%.
- Admin: lint/build and 206 tests. All full/production dependency audits report
  zero vulnerabilities. Lint retains three existing fast-refresh warnings in
  the unmodified shared phone field; no new errors.
- 30 production-build browser cases passed across Chromium, Firefox and WebKit,
  at 1440×900 and 390×844. Runtime consoles are clean; UI validates the reason,
  cash confirmation and real courier, hides forbidden/terminal actions, refreshes
  list/history and handles conflict/focus. Expected 409 resource diagnostics are
  excluded from runtime-console assertions.
- Two additional Chromium desktop/mobile scenarios use a real local Nest API,
  PostgreSQL `sacakly_test`, Redis DB 15 and the real authorized HTTP endpoints.
  Both confirm durable CASH_RETURNED/history/settlement and shift inclusion.
  No production orders were changed by verification.
- Paired baseline/current production profiles with 50 orders and sound muted:
  LCP 544/400 ms, CLS 0.00115 in both, maximum measured event duration 64 ms
  in both. Completion plus cache refresh took 67 ms in the isolated UI profile;
  an unrelated mounted card retained its DOM with zero mutations. This is a
  local sample, not production p75 or a React render-count assertion.
  Full real-API samples with normal sound enabled recorded 304–544 ms maximum
  event duration; first-gesture sound initialization remains outside this change.
- Initial HTML JavaScript preload set: 486,361 → 486,434 bytes raw,
  152,028 → 152,058 bytes gzip. Order board: 61,700 → 63,173 raw,
  17,267 → 17,638 gzip. Completion dialog is a separate 5,603/2,242-byte
  raw/gzip chunk, absent from initial preloads. No new poller, provider, dependency
  or competing cache was introduced. Hygiene and whitespace checks passed.

Browser regressions: `apps/admin/tests/browser/order-complete.spec.ts`.
Real-API run: set `ORDER_COMPLETE_QA_FIXTURE` to a private test-session/order
fixture on an isolated local API on port 4017 and run
`ADMIN_QA_PRODUCTION=1 npm --prefix apps/admin run test:playwright --
order-complete-real-api.spec.ts --project=chromium-desktop
--project=chromium-mobile --workers=1` after the admin production build.
Never use a production session or production data for that fixture.

No Prisma migration, schema backfill, synthetic employee or mobile release is
required. Existing mobile/courier transition endpoints remain compatible.
