# Проверка админки A7-tagam на планшетах

Документ фиксирует поддерживаемые планшетные состояния, реальные API каждого
раздела и воспроизводимые проверки. Он не содержит production-токенов, OTP,
телефонных номеров или других секретов.

## Поддерживаемые размеры и поведение

- До 1180 px постоянная боковая панель заменяется закрытым по умолчанию drawer;
  на touch-устройствах drawer сохраняется и в альбомной ориентации до 1366 px.
  Скрытый drawer не получает клики, закрывается по закреплённой внутренней
  кнопке, scrim, ссылке или Escape; после кнопки и Escape фокус возвращается к
  переключателю меню.
  Открытая панель прокручивается независимо от страницы, включая низкие
  viewport, safe-area и нижний блок пользователя.
- Основная область ограничена шириной viewport и не создаёт горизонтальный
  scroll всей страницы. Таблицы используют собственный container breakpoint и
  превращаются в подписанные карточки, когда их фактическая ширина не больше
  760 px.
- Kanban заказов показывает две колонки до 1180 px и одну до 760 px.
- Карта курьеров на портретном планшете 621–860 px идёт отдельной полноширинной
  строкой над списком и деталями курьеров. На более широком планшете сохраняется
  двухколоночное рабочее место. Перед картой показывается GPS coverage: курьеры
  без координат перечислены по имени, а служебные точки подписаны как филиалы.
- Формы переходят с трёх колонок на две до 1100 px и на одну на телефоне.
- В `/accounting` сводка переходит с трёх колонок на две на планшете и одну на
  телефоне; карточки смен переходят с двух колонок на одну. У бухгалтера это
  единственный пункт меню, администратор видит сумму к сдаче, а настройки и
  ходовые блюда доступны только `SUPER_ADMIN`.
- В `/catalog` блок главного чекового аппарата имеет собственные внутренние
  отступы: описание не касается границ карточки, поле IP и действие образуют
  одну выровненную группу, до 980 px она переносится под описание, а на
  телефоне поле и кнопки занимают полную ширину.
- Быстрые настройки `/catalog` показывают явные действия очистки IP и удаления
  категории; в раскрытой группе блюда имеют inline IP, очистку override и
  удаление. Действия переносятся внутри карточки, а необратимое удаление всегда
  открывает отдельный `alertdialog`.
- Для устройств с coarse pointer кнопки, ссылки действий, поля и select имеют
  высоту касания не меньше 44 px.
- Модальные окна ограничены viewport, а редакторы каталога, заказа и филиала
  прокручиваются внутри собственной панели.
- В телефонном заказе поиск адреса показывает варианты в потоке формы, а не
  поверх карты. После явного выбора варианта появляется отдельное подтверждение
  точки, карта не выше 450 px на широком экране и 340 px на телефоне. Подъезд,
  этаж, квартира и ориентир сгруппированы отдельно с пояснением, что они не
  меняют маркер.

## Маршруты и реальные API

Все запросы ниже выполняются с ролью `ADMIN` или `SUPER_ADMIN`, кроме явно
публичных запросов. Клиент использует один общий авторизованный API-клиент.

| Раздел админки | Основные GET API для открытия экрана |
| --- | --- |
| `/orders` | `/orders?page=1&limit=1`, `/staff/couriers`, `/branches` |
| `/accounting` | `/accounting/settings`, `/accounting/shifts`, для `ACCOUNTANT`/`SUPER_ADMIN` также `/accounting/report` |
| `/couriers/map` | `/tracking/dispatch`, выбранный маршрут `/orders/couriers/:courierId/route` |
| `/branches` | `/branches` |
| `/delivery` | `/delivery/admin/config` |
| `/catalog` | `/catalog/admin/categories`, `/catalog/admin/products`, `/catalog/admin/receipt-printers`, `/catalog/admin/receipt-print-settings` |
| `/marketing` | `/marketing/admin/banners`, `/marketing/promos` |
| `/notifications` | `/notifications/admin/campaigns?page=1&limit=25` |
| `/staff` | `/staff`, `/staff/recent-logins` |
| `/contacts` | `/contacts` |
| `/settings/app-versions` | `/app/admin/versions`; запись `PUT /app/admin/versions/:platform`, публичная проверка `/app/version?platform=ANDROID|IOS` |
| `/login-attempts` | `/staff/login-attempts?page=1&limit=25` |

## Выполненный API smoke

22 августа 2026 года локальный NestJS API был поднят с PostgreSQL, Redis и
MinIO. Через обычный OTP endpoint была создана локальная `SUPER_ADMIN`-сессия,
после чего все API из таблицы были запрошены тем же bearer-контрактом, который
использует админка. Каждый запрос вернул HTTP `200`:

```text
orders: 200
courier map: 200
branches: 200
delivery: 200
catalog categories: 200
catalog products: 200
printer settings: 200
marketing banners: 200
marketing promos: 200
notifications: 200
staff: 200
recent logins: 200
contacts: 200
login attempts: 200
```

Новый контур кассы дополнительно проверен изолированным HTTP e2e-тестом без
браузера: роли, две смены, однократная передача, атомарное подтверждение двух
заказов, недельный/месячный диапазон и доступ к аналитике.

Проверка выполнялась через API без браузерной автоматизации. Она доказывает
доступность реальных данных и контрактов всех экранов. Адаптивные гарантии
проверяются отдельными frontend-тестами по маршрутам, стабильным `data-testid`,
container/media breakpoints и отсутствию page-level overflow. Реестр аппаратов
проверяется через `/catalog/admin/receipt-printers`; UI хранит имя, LAN IP, порт,
протокол и активность, а маршруты выбирают сохранённый аппарат по ID.

## Повторная авторизованная API-проверка

Перед запуском задаются только локальные переменные оболочки; токен не следует
передавать аргументом команды, печатать или сохранять в файле:

```bash
export ADMIN_API_BASE_URL="https://a7-tagam.com.tm/api/v1"
export ADMIN_ACCESS_TOKEN="<temporary bearer token>"

curl --fail --silent --show-error \
  --header "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  "${ADMIN_API_BASE_URL}/orders?page=1&limit=1" >/dev/null
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  "${ADMIN_API_BASE_URL}/tracking/dispatch" >/dev/null
```

Остальные пути берутся из таблицы выше. После проверки переменная с токеном
удаляется из текущей оболочки.

## Автоматические проверки перед релизом

```bash
npm --prefix apps/admin run lint
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test
npm --prefix apps/admin audit --audit-level=low
npm --prefix apps/admin audit --omit=dev --audit-level=low

npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/api test
npm --prefix apps/api audit --audit-level=low
npm --prefix apps/api audit --omit=dev --audit-level=low
```

`apps/admin/tests/responsive-admin.test.mjs` удерживает планшетный drawer,
touch-размеры, адаптивный Kanban, карточные таблицы, портретную карту, корневые
селекторы всех одиннадцати экранов, выровненный блок главного принтера и эту
route/API-матрицу.
`apps/admin/tests/accounting-dashboard.test.mjs` удерживает настоящий API,
разделение ролей, React Hook Form/Zod формы и одноколоночную телефонную версию.
`apps/admin/tests/catalog-deletion.test.mjs` и
`apps/admin/tests/receipt-printing.test.mjs` удерживают DELETE-вызовы,
подтверждение, стабильные селекторы и явную очистку маршрута. Mutations каталога:
`DELETE /catalog/categories/:id`, `DELETE /catalog/products/:id`,
`DELETE /catalog/receipt-printers/:id`, а очистка привязки использует
существующие `PATCH` с `null`.
`apps/admin/tests/assisted-order.test.mjs` отдельно удерживает пошаговый
address-flow, доступный listbox в потоке формы, стабильные селекторы, высоту
карты и разделение координат от деталей для курьера. Функциональный тест формы
дополнительно проверяет, что изменение квартиры не меняет координаты, но не
теряется после выбора сохранённого адреса; backend e2e подтверждает квартиру в
активном адресе клиента и snapshot заказа.

## Ручная приёмка без автоматизации браузера

Если оператор проверяет планшет вручную, открыть каждый маршрут из таблицы в
портретной и альбомной ориентации, проверить drawer, отсутствие горизонтального
scroll всей страницы, формы, таблицы, модальные окна и touch-действия. Консоль
не должна содержать runtime-ошибок. Эта ручная проверка не отмечается
выполненной, пока её действительно не провели на устройстве.
