# Android SMS gateway для OTP

Этот документ описывает интеграцию готовой Android-программы с backend
A7-tagam. Android-устройство использует собственную SIM-карту, забирает SMS из
backend через HTTPS и отправляет их обычным SMS-механизмом телефона.

Сторонний SMS-провайдер для этого режима не нужен.

## Общий процесс

```text
Android запускает polling
        ↓
GET /internal/sms-gateway/pull отмечает устройство ONLINE
        ↓
Пользователь вызывает POST /auth/otp/request
        ↓
Backend создаёт OTP и зашифрованное SMS-задание в Redis
        ↓
Android получает phone, message, id и receipt
        ↓
Android отправляет SMS через SIM-карту
        ↓
Android отправляет SENT, DELIVERED или FAILED
        ↓
Пользователь подтверждает код через POST /auth/otp/verify
```

Важно: Android-программа должна запустить polling до первого запроса OTP.
Backend создаёт SMS-задания только при наличии онлайн-устройства. Каждый
успешный `pull` обновляет heartbeat автоматически.

## Настройка backend

В production environment:

```env
SMS_PROVIDER=android_pull
SMS_GATEWAY_DEVICE_ID=android-primary
SMS_GATEWAY_AUTH_REQUIRED=false
SMS_GATEWAY_DEVICE_TOKEN=<случайный секрет минимум 32 символа>
SMS_GATEWAY_ENCRYPTION_KEY=<случайный 32-байтный ключ в Base64>
```

Значения можно сгенерировать командами:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Первый результат нужно сохранить как `SMS_GATEWAY_DEVICE_TOKEN`, второй — как
`SMS_GATEWAY_ENCRYPTION_KEY`. Значения являются секретами: их нельзя
публиковать, логировать или добавлять в Git.

В Android-программе должны быть настроены:

```text
API_BASE_URL=https://api.example.com/api/v1
```

В production разрешён только HTTPS с действительным сертификатом.

## Временный режим интеграции без токена

Сейчас `heartbeat`, `pull` и `status` не требуют ни пользовательский access
token, ни refresh token, ни отдельный токен телефона:

```env
SMS_PROVIDER=android_pull
SMS_GATEWAY_AUTH_REQUIRED=false
```

Android-приложению нужен только `API_BASE_URL`. Режим временный: любой клиент,
имеющий сетевой доступ к API, технически может получить SMS-задание или
отправить статус. Поэтому нельзя логировать ответы `pull` и надо включить
защиту сразу после завершения интеграции.

Для включения защиты позже достаточно изменить:

```env
SMS_GATEWAY_AUTH_REQUIRED=true
```

После этого Android должен передавать во все три ручки:

```http
Authorization: Bearer <SMS_GATEWAY_DEVICE_TOKEN>
```

Это отдельный постоянный секрет устройства, а не JWT пользователя или
администратора. Протокол заданий и тела ответов при включении защиты не
изменятся.

## 1. Получение следующего SMS-задания

Android вызывает endpoint каждые 3 секунды:

```http
GET /api/v1/internal/sms-gateway/pull
Accept: application/json
```

### Задание найдено — `200 OK`

```json
{
  "id": "0f0e83fd-8b14-4d5c-bf5c-239d3565b115",
  "phone": "+99365123456",
  "message": "A7-tagam: код входа 123456. Никому не сообщайте код.",
  "expiresAt": "2026-07-28T12:05:00.000Z",
  "receipt": "b77e1b1d-3321-492f-9d93-82e54fe4f411"
}
```

Поля:

| Поле | Назначение |
| --- | --- |
| `id` | UUID задания, используется в URL подтверждения |
| `phone` | Номер получателя в международном формате |
| `message` | Готовый текст SMS; Android не должен его изменять |
| `expiresAt` | Время окончания действия OTP в UTC |
| `receipt` | Одноразовый lease receipt для подтверждения этого получения |

Если `expiresAt` уже наступил, Android не должен отправлять SMS. Нужно
подтвердить задание статусом `FAILED` и `errorCode: "EXPIRED_ON_DEVICE"`.

### Очередь пустая — `204 No Content`

Тело отсутствует. Ответ содержит:

```http
Retry-After: 3
```

Android ждёт 3 секунды и повторяет `GET`. Ответ `204` не является ошибкой.

### Правила получения

- Одно задание атомарно выдаётся только одному запросу.
- Lease действует 45 секунд.
- Android должен подтвердить результат как можно быстрее.
- Если подтверждение не пришло, задание возвращается в очередь.
- После трёх неуспешных попыток backend закрывает задание и отменяет
  соответствующий OTP.
- Для каждого нового получения используется новый `receipt`. Старый `receipt`
  нельзя использовать после повторной выдачи задания.
- Не нужно сохранять задание в постоянном хранилище телефона после успешного
  подтверждения.

## 2. Подтверждение результата отправки

```http
POST /api/v1/internal/sms-gateway/jobs/{id}/status
Content-Type: application/json
```

### SMS передано Android-системе

```json
{
  "receipt": "b77e1b1d-3321-492f-9d93-82e54fe4f411",
  "status": "SENT"
}
```

### Оператор подтвердил доставку SMS

Если Android API/SIM предоставляет delivery report:

```json
{
  "receipt": "b77e1b1d-3321-492f-9d93-82e54fe4f411",
  "status": "DELIVERED"
}
```

`DELIVERED` можно отправить после `SENT` или сразу вместо `SENT`.

### SMS не отправлено

```json
{
  "receipt": "b77e1b1d-3321-492f-9d93-82e54fe4f411",
  "status": "FAILED",
  "errorCode": "NO_SIGNAL"
}
```

Допустимые статусы:

| Статус | Когда отправлять |
| --- | --- |
| `SENT` | Android SMS API успешно принял SMS на отправку |
| `DELIVERED` | Получен delivery report от оператора связи |
| `FAILED` | Android или SIM не смогли отправить SMS |

`errorCode` необязателен и может содержать не больше 80 символов. Рекомендуемые
значения: `NO_SIGNAL`, `NO_SIM`, `PERMISSION_DENIED`, `RADIO_OFF`,
`GENERIC_FAILURE`, `EXPIRED_ON_DEVICE`.

Успешный ответ:

```json
{
  "accepted": true,
  "idempotent": false,
  "status": "SENT"
}
```

Повтор такого же запроса безопасен. В этом случае backend отвечает:

```json
{
  "accepted": true,
  "idempotent": true,
  "status": "SENT"
}
```

Android может повторить подтверждение после сетевой ошибки, используя те же
`id`, `receipt` и `status`.

## 3. Явный heartbeat

Отдельный heartbeat необязателен, потому что каждый `pull` уже отмечает
устройство онлайн. Его можно использовать при запуске приложения или во время
паузы polling:

```http
POST /api/v1/internal/sms-gateway/heartbeat
```

Ответ:

```json
{
  "deviceId": "android-primary",
  "status": "ONLINE",
  "serverTime": "2026-07-28T12:00:00.000Z",
  "pollIntervalSeconds": 3
}
```

Heartbeat действует 30 секунд. Если Android не делает `pull` или `heartbeat`
дольше этого времени, новый запрос OTP получит `503 Service Unavailable`.

## Коды ответов шлюза

| HTTP | Значение | Действие Android |
| --- | --- | --- |
| `200` | Запрос принят | Обработать JSON |
| `204` | SMS-заданий нет | Повторить `pull` через `Retry-After` |
| `400` | Некорректный UUID или JSON | Не повторять без исправления данных |
| `401` | Неправильный device token | Остановить polling и сообщить оператору |
| `404` | Задание уже удалено или истекло | Удалить локальное задание |
| `409` | Неверный receipt или недопустимый статус | Не отправлять старое подтверждение |
| `500/503` | Временная проблема backend/Redis | Повторить с увеличивающейся задержкой |

Для `GET pull` нормальная частота — один запрос каждые 3 секунды. Нельзя
запускать несколько параллельных polling-циклов на одном устройстве.
Сервер не ограничивает частоту запросов и не возвращает `429`.

## Клиентский OTP-флоу

Клиентское приложение запрашивает код:

```http
POST /api/v1/auth/otp/request
Content-Type: application/json

{
  "phone": "+99365123456"
}
```

Ответ:

```json
{
  "expiresInSeconds": 300
}
```

После получения SMS пользователь подтверждает код:

```http
POST /api/v1/auth/otp/verify
Content-Type: application/json

{
  "phone": "+99365123456",
  "code": "123456",
  "firstName": "Aman",
  "lastName": "Ataýew"
}
```

`firstName` и `lastName` необязательны. При первой успешной проверке backend
создаёт пользователя, при следующих — авторизует существующего.

## Надёжность Android-программы

Рекомендуемый алгоритм:

1. Запустить один foreground service.
2. Вызвать `heartbeat` или сразу `pull`.
3. При `204` повторить `pull` через 3 секунды.
4. При `200` проверить `expiresAt`.
5. Отправить неизменённые `phone` и `message` через SIM.
6. Отправить `SENT`, `DELIVERED` или `FAILED` с полученным `receipt`.
7. При сетевой ошибке повторить тот же status-запрос.
8. После успешного подтверждения удалить локальную копию задания.
9. После перезапуска снова начать с `heartbeat`/`pull`.

Для временных сетевых ошибок рекомендуется backoff `3 → 5 → 10 → 20`
секунд с возвратом к трёхсекундному интервалу после успешного ответа.

## Безопасность

- Телефон, текст SMS и внутренний OTP request ID хранятся в Redis в
  AES-256-GCM-зашифрованном виде.
- OTP действует 5 минут и проверяется только один раз.
- Device token сравнивается безопасным способом и не возвращается из API.
- В логах Android и backend нельзя сохранять `message`, OTP, device token или
  полный номер телефона.
- Device token и encryption key должны отличаться для dev и production.
- При компрометации телефона нужно заменить device token, перезапустить
  backend и обновить конфигурацию Android-программы.
- Endpoint шлюза не должен быть доступен по незашифрованному HTTP в production.

## Swagger

После запуска backend интерактивный контракт доступен по адресу:

```text
http://localhost:4000/docs
```

Нужные операции находятся в разделе `sms-gateway`.
