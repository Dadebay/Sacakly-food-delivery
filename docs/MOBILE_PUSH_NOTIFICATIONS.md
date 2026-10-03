# Mobile push notifications: Android and iOS

> Актуализация 2026-09-13: публичная рассылка гостям использует топик
> **`a7-tagam`** по явному требованию владельца. Старое имя `hantagam`
> заменяется в мобильной сборке. Интеграция: [MOBILE_TOPIC_BROADCAST.md](MOBILE_TOPIC_BROADCAST.md).
> Администратор выбирает «Все устройства, включая гостей». Персональные
> рассылки/inbox остаются отдельной аудиторией. Фактическая доставка на телефоне
> требует проверки после обновления подписки.

Эта инструкция описывает полный локальный flow для мобильной команды AlowAlow:

```text
Firebase SDK -> FCM registration token
             -> PUT /notifications/devices с CUSTOMER или COURIER JWT
             -> PostgreSQL device registration

ADMIN/SUPER_ADMIN -> notification campaign
                  -> PostgreSQL inbox + delivery outbox
                  -> Firebase Cloud Messaging
                  -> Android/iOS
```

Firebase используется только как транспорт push-уведомлений. Телефонная
авторизация, OTP, JWT, пользователи, роли и история уведомлений принадлежат
NestJS/PostgreSQL AlowAlow. Мобильное приложение не должно содержать Firebase
service account, `FCM_SERVICE_ACCOUNT_BASE64` или другие серверные секреты.

## Быстрый чек-лист

Для первого сквозного теста мобильщик должен:

1. Подключить приложение к Firebase-проекту `alowalow-c3a21`.
2. Получить FCM registration token средствами Firebase Messaging.
3. Запустить локальный NestJS API и указать доступный телефону `API_BASE_URL`.
4. Войти как клиент через локальный OTP и получить customer `accessToken`.
5. Передать актуальный FCM token в `PUT /notifications/devices`.
6. Отправить кампанию из админки или через API с токеном администратора.
7. Проверить системный push и сохранённый inbox приложения.

## Какой идентификатор отправлять backend

AlowAlow использует **FCM registration token**. Не отправляйте Firebase
Installation ID (FID) или сырой APNs device token: Firebase Admin SDK адресует
конкретное устройство именно FCM token. Он приходит из стандартного callback:

- Android: `FirebaseMessagingService.onNewToken(token)`;
- iOS: `MessagingDelegate.messaging(_:didReceiveRegistrationToken:)`.

Backend отправляет сообщения через поле `token` Firebase Admin SDK. Повторно
передавайте token после каждого callback обновления: token может
измениться после переустановки, очистки данных или восстановления на другом
устройстве.

## Одноразовая настройка Firebase

### Android

1. В Firebase Console откройте проект `alowalow-c3a21`.
2. Добавьте Android app с **точным package name** мобильного приложения.
3. Скачайте `google-services.json` и добавьте его в Android app module по
   инструкции Firebase. Это клиентская конфигурация, не service account.
4. Подключите Firebase Messaging SDK и Google Services Gradle plugin.
   Конкретные актуальные версии берите из официальной Firebase-документации,
   не копируйте случайные версии из примеров.
5. На Android 13+ запросите runtime-разрешение `POST_NOTIFICATIONS`.
6. До получения первого сообщения создайте notification channel и объявите
   его как `com.google.firebase.messaging.default_notification_channel_id`
   в AndroidManifest. По переданному контракту мобильных приложений клиентский
   канал — `alowalow_orders`, курьерский — `kurier_orders`.

Минимальный callback регистрации:

```kotlin
class AlowAlowMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Сохранить локально и после входа отправить в AlowAlow API.
        pushRegistrationRepository.syncFcmToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Обработать notification title/body и data-поля из таблицы ниже.
    }
}
```

Текущий token также можно запросить явно после login:

```kotlin
FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if (task.isSuccessful) {
        pushRegistrationRepository.syncFcmToken(task.result)
    }
}
```

### iOS

Для настоящего APNs push нужен физический iPhone, Apple Developer account и
APNs authentication key. Локальный backend может работать на Mac, но доставку
следует проверять на физическом устройстве.

1. В Firebase Console добавьте Apple app с **точным и регистрозависимым Bundle
   ID** приложения.
2. Скачайте `GoogleService-Info.plist`, добавьте его в Xcode target и проверьте,
   что он включён в нужную сборку.
3. Подключите Firebase Messaging через Swift Package Manager.
4. В Xcode включите capabilities `Push Notifications` и нужный режим
   `Background Modes -> Remote notifications`.
5. В Firebase Console откройте `Project settings -> Cloud Messaging` и
   загрузите APNs authentication key `.p8`, указав Key ID и Team ID.
6. Вызовите `FirebaseApp.configure()`, запросите разрешение пользователя на
   уведомления, зарегистрируйтесь для remote notifications и назначьте
   `Messaging.messaging().delegate`.

Минимальный callback регистрации:

```swift
extension AppDelegate: MessagingDelegate {
    func messaging(
        _ messaging: Messaging,
        didReceiveRegistrationToken fcmToken: String?
    ) {
        guard let fcmToken else { return }
        // Сохранить локально и после входа отправить в AlowAlow API.
        pushRegistrationRepository.syncFcmToken(fcmToken)
    }
}
```

Текущий token также можно запросить явно после login:

```swift
let token = try await Messaging.messaging().token()
pushRegistrationRepository.syncFcmToken(token)
```

Не отключайте Firebase method swizzling без необходимости. Если команда всё же
его отключает, она должна самостоятельно корректно передать APNs token в
Firebase Messaging согласно официальной инструкции.

## Запуск локального backend

Из корня монорепозитория:

```bash
docker compose up -d postgres redis minio
node apps/api/scripts/init-local-s3.mjs
npm --prefix apps/api run db:deploy
npm --prefix apps/api run db:seed
npm --prefix apps/api run start:dev
```

Backend слушает `0.0.0.0:4000`. Проверка на машине разработчика:

```bash
curl http://127.0.0.1:4000/api/v1/health
```

Ожидаемый ответ содержит `"status":"ok"`. Swagger доступен на
`http://127.0.0.1:4000/docs`.

### Как выбрать API_BASE_URL

| Клиент                                    | Локальный base URL                |
| ----------------------------------------- | --------------------------------- |
| Реальный телефон в одной Wi-Fi сети с Mac | `http://<LAN_IP_MAC>:4000/api/v1` |
| Android Emulator                          | `http://10.0.2.2:4000/api/v1`     |
| iOS Simulator                             | `http://127.0.0.1:4000/api/v1`    |
| Android по USB после `adb reverse`        | `http://127.0.0.1:4000/api/v1`    |

Узнать Wi-Fi IP Mac:

```bash
ipconfig getifaddr en0
```

Android по USB:

```bash
adb reverse tcp:4000 tcp:4000
```

`localhost` на физическом телефоне означает сам телефон, а не Mac. Для
локального HTTP добавляйте cleartext/ATS exception **только в debug
конфигурацию** приложения. Release-сборки и серверные стенды должны работать по
HTTPS. Если реальный телефон не открывает health endpoint, проверьте общую
Wi-Fi сеть, macOS Firewall и отсутствие client isolation на роутере.

## Локальный вход клиента через OTP

В локальном `apps/api/.env` должен быть `SMS_PROVIDER=console`. Тогда код не
отправляется SMS и возвращается в поле `devCode` только в development.

Запросить код:

```http
POST /api/v1/auth/otp/request
Content-Type: application/json

{
  "phone": "+99365123456"
}
```

Пример development-ответа:

```json
{
  "expiresInSeconds": 300,
  "devCode": "123456"
}
```

Подтвердить код:

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

`firstName` и `lastName` необязательны. Из ответа сохраните `accessToken` и
`refreshToken` в platform-secure storage. `devCode` никогда не существует в
production-ответе.

## Регистрация FCM token в AlowAlow

Сразу после успешного входа клиента или курьера и после каждого `onNewToken` /
`didReceiveRegistrationToken` отправьте актуальный token:

```http
PUT /api/v1/notifications/devices
Authorization: Bearer <customer-or-courier-access-token>
Content-Type: application/json

{
  "installationId": "<fcm-registration-token>",
  "platform": "ANDROID",
  "appVersion": "1.0.0",
  "locale": "ru-TM"
}
```

Для Apple используйте `"platform":"IOS"`. Поле называется `installationId`
только для обратной совместимости API; фактическое значение — секретный FCM
registration token длиной 10–255 символов.

Успешный `PUT` возвращает зарегистрированное устройство с `isActive:true` и
`lastSeenAt`. Endpoint идемпотентен: повторная отправка обновляет владельца,
версию, locale и время активности. Поэтому безопасно синхронизировать token при
каждом запуске после входа.

Endpoint доступен `CUSTOMER` и `COURIER`; токен привязывается к текущему
авторизованному пользователю. Остальные сотрудники не получают доступ, кроме
существующего глобального исключения `SUPER_ADMIN`. Курьер не получает право
создавать кампании или читать клиентский inbox.

## Получение и обработка сообщения

FCM notification содержит стандартные `title` и `body`, а также data-поля:

| Поле             | Назначение                                                    |
| ---------------- | ------------------------------------------------------------- |
| `campaignId`     | ID кампании; у прямого push — `direct:<userId>:<eventId>`       |
| `notificationId` | ID inbox для кампании; уникальный ID события для прямого push |
| `deepLink`       | Необязательный внутренний маршрут, например `/orders/current` |

`notificationId` используйте для дедупликации. Доставка outbox имеет гарантию
«как минимум один раз», поэтому после восстановления worker одно сообщение
может безопасно прийти повторно.

`deepLink` нельзя открывать как произвольный URL. Мобильное приложение должно
разрешать только известные внутренние маршруты. Не передавайте `deepLink` в
WebView и не открывайте внешние схемы без отдельного allowlist.

Backend не передаёт фиксированный Android `channelId`: FCM использует канал
из манифеста конкретного приложения, как описано в
[Firebase Admin SDK](https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging.androidnotification#androidnotificationchannelid).
На iOS обработайте
foreground presentation через `UNUserNotificationCenterDelegate`, если push
должен быть виден при открытом приложении. Поведение foreground/background/
terminated проверяйте отдельно.

## Отправка первого тестового push

После `db:seed` локальный администратор имеет телефон `+99365000001`. Получите
для него токен через тот же OTP flow: в development `devCode` вернётся в
ответе. Затем создайте кампанию:

```http
POST /api/v1/notifications/admin/campaigns
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "title": "Тест AlowAlow",
  "body": "Push работает",
  "deepLink": "/orders/current"
}
```

Создавать и повторять кампании могут только `ADMIN` и `SUPER_ADMIN`. Worker
забирает кампанию автоматически. Итоговый статус:

- `SENT` — все доступные доставки успешны;
- `PARTIAL` — часть устройств получила push, часть завершилась ошибкой;
- `FAILED` — успешных доставок нет;
- `PENDING`/`SENDING` — кампания ещё обрабатывается.

Кампанию также можно создать в React-админке в разделе «Уведомления».

## Push курьеру при назначении заказа

Курьер входит через обычный OTP flow и регистрирует FCM token через
`PUT /api/v1/notifications/devices` с собственным JWT. Firebase-проект
приложения должен совпадать с проектом серверного service account. Согласно
переданному мобильному документу, курьерское приложение —
`com.gurbanov.kurier` в проекте `alowalow-c3a21`.

Назначение выполняет `OPERATOR`, `ADMIN` или `SUPER_ADMIN`:

```http
PATCH /api/v1/orders/<orderId>/assign-courier
Authorization: Bearer <operator-or-admin-access-token>
Content-Type: application/json

{
  "courierId": "<courier-user-id>",
  "version": 2
}
```

`version` берётся из текущего ответа заказа. После успешного коммита новый
курьер получает адресное уведомление на свои активные устройства:

- заголовок: `Täze sargyt #<номер заказа>`;
- текст: `Sargyt size berkidildi. Jikme-jiklikleri açyň.`

Уведомление отправляется также при переназначении до начала доставки и при
смене курьера через `PATCH /orders/:id/admin-edit`. Старый курьер его не
получает. Повторное назначение того же курьера, ошибка прав/версии и изменение
состава, возвращающее заказ в кухню без курьера, не отправляют push о назначении.

Это прямой best-effort push: он не создаёт кампанию, delivery outbox или запись
inbox и не имеет автоматического повтора. Сбой FCM или отсутствие устройств
не отменяют сохранённое назначение. При получении push или открытии приложения
обновите свой список заказов через `GET /api/v1/orders` с courier JWT.
`notificationId` здесь является ID события, а не inbox-записи; каждый новый
push имеет новый ID. `deepLink` для этого сообщения не передаётся.
Не отправляйте сведения о назначении в общий FCM-топик.

Проверка на устройстве:

1. Войти курьером и проверить успешный `PUT /notifications/devices`.
2. Назначить упакованный заказ и проверить push с его номером.
3. Назначить второй заказ тому же курьеру: оба уведомления должны отобразиться.
4. Переназначить первый заказ другому курьеру: новый push получает новый курьер.
5. Проверить foreground/background/холодный запуск и канал `kurier_orders`.
6. Перед logout удалить token через `DELETE /notifications/devices/<token>`;
   при следующем входе зарегистрировать его повторно.

Для реальной доставки backend должен работать с `PUSH_PROVIDER=fcm`.
Локальные API-тесты подменяют FCM; получение на физическом устройстве
проверяется отдельно мобильной командой.

## Inbox мобильного приложения

Для административных кампаний push — сигнал, а не единственный источник данных.
Backend сохраняет уведомление в PostgreSQL, поэтому клиент восстанавливает историю даже при
запрещённых системных уведомлениях или временном отсутствии сети.

```text
GET   /api/v1/notifications/me?page=1&limit=25
GET   /api/v1/notifications/me/unread-count
PATCH /api/v1/notifications/me/<notificationId>/read
POST  /api/v1/notifications/me/read-all
```

Все endpoint требуют customer JWT и возвращают только inbox текущего клиента.
После получения push обновите unread count и соответствующий список, но не
создавайте локальную «истину» отдельно от backend inbox.

## Logout и смена пользователя

Перед logout, пока клиентский или курьерский `accessToken` ещё действителен, деактивируйте token.
Значение в path обязательно URL-encode:

```http
DELETE /api/v1/notifications/devices/<url-encoded-fcm-token>
Authorization: Bearer <customer-or-courier-access-token>
```

После успешного ответа удалите локальную пользовательскую сессию. При новом
login повторно вызовите `PUT /notifications/devices`: одна установка может
безопасно перейти к новому авторизованному пользователю, но пользователь не
может деактивировать чужое устройство.

## Диагностика

### Health endpoint не открывается на телефоне

- убедитесь, что NestJS запущен и слушает `0.0.0.0:4000`;
- не используйте `localhost` на физическом телефоне;
- проверьте LAN IP, одну Wi-Fi сеть и macOS Firewall;
- для Android Emulator используйте `10.0.2.2`;
- для Android USB повторите `adb reverse tcp:4000 tcp:4000`;
- debug-приложение должно разрешать локальный HTTP.

### `401 Unauthorized` на `/notifications/devices`

- передан ли `Authorization: Bearer <accessToken>`;
- это access token, а не refresh token;
- пользователь имеет роль `CUSTOMER` или `COURIER` и активен;
- после refresh используйте новый access token.

### `400 Bad Request` при регистрации

- `platform` должен быть строго `ANDROID` или `IOS`;
- передаётся FCM registration token, а не FID или APNs token;
- token соответствует разрешённому формату и длине;
- неизвестные поля запрещены глобальной whitelist-валидацией NestJS.

### Кампания есть, но телефон не получил push

1. Убедитесь, что backend работает с `PUSH_PROVIDER=fcm`, а не `console`.
2. Проверьте, что token получен из Firebase-проекта `alowalow-c3a21` и был
   успешно зарегистрирован в AlowAlow после customer login.
3. Android: проверьте `onNewToken`, разрешение уведомлений и default channel
   в манифесте (`alowalow_orders` у клиента, `kurier_orders` у курьера).
4. iOS: проверьте физическое устройство, capabilities, APNs `.p8`, Bundle ID,
   разрешение пользователя и callback `didReceiveRegistrationToken`.
5. Проверьте статус кампании и `failedCount` в админке/API.
6. Если FCM сообщает, что installation не зарегистрирована, backend помечает
   этот token неактивным; приложение должно получить актуальный FCM token и
   выполнить `PUT /notifications/devices`.

### Push виден, но inbox пуст

- запросите `/notifications/me` с токеном того же клиента, который
  регистрировал token;
- не подменяйте пользователя без повторного `PUT /notifications/devices`;
- push payload содержит `notificationId`, совпадающий с записью inbox этого
  клиента.

## Backend-only конфигурация

Эти значения принадлежат только локальному/серверному runtime NestJS:

```dotenv
PUSH_PROVIDER=fcm
FCM_SERVICE_ACCOUNT_BASE64=<base64 service-account JSON без переносов>
PUSH_DISPATCH_INTERVAL_MS=5000
```

В обычной разработке без реального устройства можно использовать
`PUSH_PROVIDER=console`: роли, кампании, outbox и inbox работают, но системный
push не отправляется. Для настоящего устройства нужен `fcm`.

Service-account JSON и его base64 нельзя добавлять в Git, мобильную сборку,
`google-services.json`, `GoogleService-Info.plist`, логи, issue или чат. На
сервере секрет задаётся через защищённый runtime environment. Клиентские
Firebase config-файлы не дают прав Firebase Admin SDK, но их всё равно надо
хранить и распространять согласно правилам мобильных репозиториев.

## Готовность мобильной реализации

Перед передачей в QA должны пройти все пункты:

- [ ] Android и/или iOS app зарегистрирован в проекте `alowalow-c3a21`.
- [ ] Package name / Bundle ID точно совпадает с приложением.
- [ ] FCM token callback срабатывает после чистой установки.
- [ ] Token повторно синхронизируется после login и callback обновления.
- [ ] `PUT /notifications/devices` возвращает `isActive:true`.
- [ ] Системный push приходит в foreground, background и после холодного
      запуска согласно требованиям платформы.
- [ ] `notificationId` дедуплицирует повторную доставку.
- [ ] Разрешённый `deepLink` открывает нужный внутренний экран.
- [ ] Запрещённый/неизвестный `deepLink` безопасно игнорируется.
- [ ] Inbox и unread count восстанавливаются из API.
- [ ] Read и read-all синхронизируются с backend.
- [ ] Logout вызывает `DELETE /notifications/devices/<url-encoded-token>` до
      удаления JWT.
- [ ] После входа другого пользователя устройство не получает уведомления
      предыдущего пользователя.

## Официальная документация Firebase

- [Android FCM setup](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [Android FirebaseMessagingService](https://firebase.google.com/docs/reference/android/com/google/firebase/messaging/FirebaseMessagingService)
- [Apple FCM setup and APNs](https://firebase.google.com/docs/cloud-messaging/ios/get-started)
- [Swift Messaging API](https://firebase.google.com/docs/reference/swift/firebasemessaging/api/reference/Classes/Messaging)
- [FCM registration management](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
- [Firebase Admin SDK sending](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)
- [Trusted server environment](https://firebase.google.com/docs/cloud-messaging/server-environment)
