# AlowLink Platform

AlowLink — новый бренд для маркетплейса кафе AlowAlow. Это **отдельный приватный
монорепозиторий** на основе зафиксированного исходного кода A7-tagam. Действующий
A7-tagam продолжает работать из прежнего репозитория и своей базы.

Текущий этап платформы: API для регистрации и одобрения курьеров, выдачи доступа
сотруднику конкретного кафе, включения модулей владельцем и создания заказа из
одного кафе. Новые заказы выбирают только филиал этого кафе. Серверные тесты
проверяют запреты для чужого кафе и отсутствие прав OWNER только по номеру.
Существующая operations-админка и остальные старые API ещё относятся к
одному оператору; **этот код не готов к подключению независимых кафе или
публичному запуску**. Дальнейшие шаги и границы данных описаны в
[контексте платформы](../PROJECT_CONTEXT.md).

Доступ OWNER выдаётся существующему аккаунту после успешного OTP-входа:
запустите dry run команды `npm --prefix apps/api run platform:owner`, затем
передайте `-- --apply` для записи права в изолированной базе платформы.
Чеки используют импортированную очередь печати и print-agent; новый фискальный
провайдер не подключён. Автоматическая production-доставка здесь отключена.

## Импортированная система A7-tagam

Единый Git-монорепозиторий: NestJS API, React/Vite SPA-админка,
сгенерированный Swagger-контракт, Docker и CI/CD изменяются одним pull request.
API и admin имеют независимые npm lockfile, чтобы их security overrides и
production dependency trees проверялись отдельно.

```text
apps/api                 NestJS, Prisma, Redis, S3, SMS gateway и FCM push
apps/admin               React/Vite operations admin
packages/api-contract    генерируемые TypeScript-типы OpenAPI
deploy                   production Compose и deployment script
maps                     отдельный self-hosted OpenStreetMap tile server
routing                  приватный OSRM для маршрутов по дорогам
```

Первая рабочая версия платформы доставки еды:

- NestJS 11 API с PostgreSQL и Prisma 7;
- Redis 8 для одноразовых кодов, защиты от повторной отправки и зашифрованной
  очереди Android SMS-шлюза;
- React 19 админка для оператора, кухни, курьера, бухгалтера, администратора
  и главного администратора;
- Swagger/OpenAPI и генерируемый TypeScript-клиент;
- авторизация по телефону через одноразовый код;
- несколько адресов клиента с автоматическим выбором последнего созданного
  или использованного в заказе;
- каталог, категории, изображения, баннеры и промокоды;
- push-уведомления из админки с сохранённой историей в приложении;
- наличная оплата, передача денег курьером и бухгалтерская сверка;
- рейтинг и комментарий клиента после доставки.

## Жизненный цикл заказа

| Этап                                                 | Кто выполняет                            |
| ---------------------------------------------------- | ---------------------------------------- |
| создание сразу в `COOKING`                           | backend                                  |
| `COOKING → READY`                                    | повар                                    |
| назначение готового заказа курьеру                   | оператор или администратор               |
| `ASSIGNED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED` | назначенный курьер                       |
| `DELIVERED → CASH_RETURNED`                          | курьер после передачи наличных оператору |
| `CASH_RETURNED → RECONCILED`                         | бухгалтер                                |

`CASH_RETURNED` — завершённый заказ. Клиент и оператор не могут отменять
заказы, потому что они сразу создаются в приготовлении. Администратор или
главный администратор может отменить активный заказ от `COOKING` до
`DELIVERED`. Ограничения проверяются на сервере, а не только в UI.

У курьера нет ограничения «один активный заказ»: индекс
`courierId + status + assignedAt` позволяет быстро получить все точки и
сформировать маршрут из нескольких доставок.

Каждая принятая GPS-точка сразу отправляется авторизованной диспетчерской
админке через `GET /api/v1/tracking/dispatch/live` (`text/event-stream`). Redis
хранит последнюю точку, а 30-секундный snapshot-запрос остаётся только для
первой загрузки и восстановления соединения.

## Запуск

Требуется Node.js 22.13+ LTS (или 24+) и Docker.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
docker compose up -d postgres redis minio minio-init
npm run maps:up
npm run routing:up
npm ci
npm --prefix apps/admin ci
npm --prefix apps/api ci
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run db:migrate -- --name init
npm --prefix apps/api run db:seed
npm run dev
```

- Админка: `http://localhost:5173` (или следующий свободный порт)
- API: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs-json`
- MinIO Console: `http://localhost:9001` (`alofood` / `alofood-local-secret`)
- OpenStreetMap tiles: `http://127.0.0.1:8080`
- OSRM: `http://127.0.0.1:5000` (только для NestJS, не для клиента)

Первый `npm run maps:up` скачивает региональный MBTiles Туркменистана, стили и
шрифты, затем запускает изолированный TileServer GL. Подробности и обновление
карты: [Saçakly maps](../MAPS.md).

Первый `npm run routing:up` скачивает OSM-экстракт Туркменистана и строит
локальный автомобильный граф. Защищённая ручка
`GET /api/v1/orders/courier/route` объединяет текущую GPS-точку курьера,
уникальные филиалы выдачи и все назначенные адреса, затем возвращает настоящую
GeoJSON-линию дорог, расстояние, время и манёвры. Инструкция мобильщикам:
[Saçakly mobile map and routing](../MOBILE_MAP_AND_ROUTING.md).

В development при `SMS_PROVIDER=console` ответ
`POST /api/v1/auth/otp/request` содержит `devCode`. В production код в ответ
никогда не попадает: его HMAC хранится в Redis 5 минут, а SMS отправляет
выделенный Android-телефон с SIM-картой.
Повторная отправка доступна сразу, без почасового лимита SMS. Новый запрос
заменяет предыдущий код. На один код остаётся 5 неверных попыток ввода;
успешно использованный код атомарно удаляется. Ограничения частоты запросов
и ошибка `429 Too Many Requests` в API отключены.

Телефон выполняет pull каждые 3 секунды:

```http
GET /api/v1/internal/sms-gateway/pull
```

На время интеграционного тестирования эти три внутренние ручки работают без
access token и без device token (`SMS_GATEWAY_AUTH_REQUIRED=false`). Защищённый
режим уже сохранён в backend и позже включается значением `true`; тогда Android
передаёт `Authorization: Bearer <SMS_GATEWAY_DEVICE_TOKEN>`.

При отсутствии задания API отвечает `204 No Content`. Полученное задание
содержит `id`, `phone`, `message`, `expiresAt` и одноразовый lease `receipt`.
После попытки отправки Android подтверждает результат через
`POST /api/v1/internal/sms-gateway/jobs/<id>/status` со статусом `SENT`,
`DELIVERED` или `FAILED`.

Pull-задания AES-256-GCM-зашифрованы в Redis. Для production задайте
`SMS_PROVIDER=android_pull` и ключ из `openssl rand -base64 32`. Секрет
`SMS_GATEWAY_DEVICE_TOKEN` хранится на сервере для последующего включения
защиты. Первый pull
или `POST /api/v1/internal/sms-gateway/heartbeat` отмечает телефон онлайн.
Других production SMS-провайдеров backend не поддерживает.
Полная инструкция для готовой Android-программы, включая JSON-контракт,
heartbeat, подтверждения и обработку ошибок:
[Android SMS gateway](../ANDROID_SMS_GATEWAY.md).

Push-уведомления создают только администратор и главный администратор в разделе
«Уведомления». Backend сохраняет кампанию и inbox каждого активного клиента в
PostgreSQL, затем отправляет зарегистрированным мобильным устройствам через
Firebase Cloud Messaging. Firebase используется только для push — OTP/JWT и
пользователи остаются в AlowAlow. В локальном `PUSH_PROVIDER=console` весь flow
и история работают без отправки на телефон; для настоящего устройства нужен
`PUSH_PROVIDER=fcm` и server-only `FCM_SERVICE_ACCOUNT_BASE64`. Инструкция для
мобильщиков и полный список endpoint:
[Mobile push notifications](../MOBILE_PUSH_NOTIFICATIONS.md).

Адреса клиента доступны через `/api/v1/users/me/addresses`. Новый адрес
становится активным автоматически. Если заказ создаётся с `addressId`, этот
адрес становится активным, а в самом заказе сохраняется неизменяемый снимок
адреса на момент оформления. Если адрес не передан при создании заказа, API
использует текущий активный адрес.

Тестовые сотрудники после `db:seed`:

| Телефон        | Роль                  |
| -------------- | --------------------- |
| `+99365000000` | главный администратор |
| `+99365000001` | администратор         |
| `+99365000002` | оператор              |
| `+99365000003` | повар                 |
| `+99365000004` | курьер                |
| `+99365000005` | бухгалтер             |

## Основные команды

```bash
npm run dev:admin           # только React-админка
npm run dev:api             # только NestJS API
npm run dev                 # оба приложения
npm run maps:up             # подготовить и запустить локальную OSM-карту
npm run maps:update         # атомарно обновить данные Туркменистана
npm run maps:down           # остановить только сервер карты
npm run routing:up          # подготовить и запустить OSRM маршрутизацию
npm run routing:update      # атомарно обновить дорожный граф
npm run routing:down        # остановить только OSRM
npm run api:client          # Swagger → packages/api-contract/src/schema.ts
npm test                    # admin production build + UI smoke tests
npm run test:api            # backend unit/e2e/security tests
npm run test:all            # backend и admin
npm run build               # контракт и production builds обоих приложений
```

`npm run test:api` создаёт отдельную базу `alofood_test`, использует Redis DB
15, накатывает все миграции, выполняет unit- и HTTP e2e-тесты с отчётом
покрытия, а затем очищает тестовые хранилища. PostgreSQL, Redis и MinIO должны
быть запущены через Docker; рабочая база `alofood` и Redis DB 0 тестами не
изменяются. В CI действуют минимальные пороги покрытия: 75% statements,
60% branches, 80% functions и 78% lines.

## CI/CD

Workflow `.github/workflows/ci-cd.yml` запускается для pull request в `main`,
push в `main` и вручную. До публикации он обязательно:

- проверяет lint, production build, тесты и coverage backend;
- проверяет lint, production build и тесты админки;
- выполняет полный и production-only `npm audit` для обоих приложений;
- заново генерирует Swagger/TypeScript-контракт и отклоняет незакоммиченный
  diff;
- собирает непривилегированные API и статический React/Nginx admin
  runtime-контейнеры, а также отдельный контейнер миграций;
- проверяет production Compose.

После успешного push в `main` workflow публикует в GHCR три образа:

```text
ghcr.io/<owner>/<repository>-api:sha-<commit>
ghcr.io/<owner>/<repository>-migration:sha-<commit>
ghcr.io/<owner>/<repository>-admin:sha-<commit>
```

Образы получают тег `production`, но deployment использует только immutable
digest. BuildKit добавляет provenance и SBOM. Проверенная статическая сборка
админки также сохраняется как отдельный artifact. Если repository variable
`PRODUCTION_DEPLOY_ENABLED=true`, тот же workflow автоматически обновляет
единственный VDS через GitHub Environment `production`.

Веточная схема автодеплоя API:

```text
feature/* → PR → main → CI → GHCR → production VDS
```

Отдельной `develop`-ветки и DEV-инфраструктуры сейчас нет. Активное окружение
имеет `DEPLOYMENT_ENVIRONMENT=production`; неограниченный статический OTP в нём
запрещён, а временное тестовое исключение ограничено allowlist и датой. Заказанный
Telecom SSL установлен: production работает через
`https://a7-tagam.com.tm`, а HTTP оставлен только для перенаправления на HTTPS.
GitHub-hosted runner пока не достигает domestic SSH-порта 22, поэтому для
полного автодеплоя ещё нужен доступный из Telecom сети self-hosted runner или
согласованный транспорт; это не превращает runtime обратно в DEV.

Полная настройка веток, GitHub secrets/variables, сервера и reverse proxy:
[Saçakly infrastructure](../INFRASTRUCTURE.md) и
[deployment](../DEPLOYMENT.md).

При деплое сначала выполняется `prisma migrate deploy`. Новый API запускается
только после успешной миграции и healthcheck. Если обновление не стало healthy,
deployment-скрипт возвращает предыдущие digest-ссылки и поднимает прошлый API:

```bash
ALOWALOW_API_IMAGE=ghcr.io/owner/repository-api@sha256:... \
ALOWALOW_MIGRATION_IMAGE=ghcr.io/owner/repository-migration@sha256:... \
docker compose --file deploy/compose.production.yml up -d --wait
```

На текущем сервере production API слушает только `127.0.0.1:4000`, admin —
`127.0.0.1:3000`, TileServer — `127.0.0.1:8080`; наружу их публикует host Nginx.
PostgreSQL, TLS Redis, MinIO, OSRM и Nominatim не имеют публичных host-портов.
Runtime-секреты находятся только в защищённом `.env.production` на VDS.

## Безопасность

- короткоживущий JWT access token и ротируемый refresh token;
- OTP и refresh token защищены от повторного и параллельного использования;
- refresh token хранится в базе только как Argon2-хеш;
- OTP хранится в Redis как HMAC, имеет TTL 5 минут, 5 неверных попыток на код
  и атомарное одноразовое потребление;
- RBAC и проверка владельца/назначенного сотрудника на каждом переходе;
- оптимистическая блокировка заказа через поле `version`;
- production не запускается с dev-секретами, wildcard CORS или без базы;
- расчёт цены и скидки выполняется только сервером;
- DTO whitelist, запрет неизвестных полей, Helmet и ограниченный CORS;
- изображения проверяются, перекодируются в WebP и сохраняются под случайным
  именем в приватном S3 bucket;
- все переходы заказа и критичные действия сохраняются в журнале.
- создание, повтор и завершение push-кампании сохраняются в audit log; FCM
  service account проверяется при старте production и не передаётся клиентам.

Локально S3 API предоставляет MinIO. Для AWS S3 в production задайте
`S3_REGION` и `S3_BUCKET`, оставьте `S3_ENDPOINT` пустым и
`S3_FORCE_PATH_STYLE=false`. `S3_ACCESS_KEY_ID` и
`S3_SECRET_ACCESS_KEY` можно не задавать при использовании IAM-роли.

Перед production также необходимо задать случайные `JWT_ACCESS_SECRET` и
`OTP_PEPPER` длиной не менее 32 символов, TLS-адрес `REDIS_URL`, секреты
Android SMS-шлюза, FCM service account и провайдера маршрутов/карт для расчёта
реального ETA.
