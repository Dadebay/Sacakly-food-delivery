# Saçakly customer (Flutter)

Android/iOS customer prototype for the Saçakly API in this repository. It
uses the former `food_delivery/food_delivery` app's icons, fonts and bundled
visual assets. The local demo seed copies that app's two cafes, six categories,
13 dishes and two existing onboarding images as banners, then adds three fake
users and three sample orders to Saçakly's own PostgreSQL database. The former
production API was unreachable during setup, so no live content was imported.

## Flutter code layout

The customer app follows the former Flutter project's `main.dart` + `app.dart`,
`core/` and `modules/` layout. Entry and Firebase setup stay in `lib/main.dart`;
`lib/app.dart` owns `MaterialApp`. Shared API, store, cart model, push service,
theme and widgets live under `lib/core/`. Screens are split under
`lib/modules/auth`, `cart`, `catalog`, `checkout`, `home`, `orders`, `profile`
and `shell`; banner UI is
in `lib/modules/home/widgets`. Only implemented features have a module, so
folders for the former app's unrelated features are not copied.
The bottom dock groups Kafeler, Menü and Sepet in one capsule and places Profil
in a separate round action. Siparişlerim is reachable from Profil; notification
deep links still open the orders screen directly.
The theme uses the former app's main yellow (`#F7D148`) with dark text and
icons on yellow surfaces, plus its orange accent for menu prices.

## Run locally

Android cihazı USB ile bağlıyken Docker, API, yerel harita ve Flutter'ı tek
komutla başlatmak için `apps/customer` klasöründe `./run.sh` çalıştırın. Birden
fazla cihaz bağlıysa `./run.sh <android-cihaz-id>` kullanın. Betik API'yi
cihazın `localhost` adresine `adb reverse` ile bağlar ve Flutter'ı hot reload
destekleyen debug modunda çalıştırır. Yerel veritabanı boşsa örnek menüyü bir
kez oluşturur; mevcut kafe verilerine tekrar seed uygulamaz.

From the repository root:

```sh
npm ci --prefix apps/api
npm ci --prefix apps/admin
npm ci --prefix apps/merchant
cp apps/api/.env.example apps/api/.env
# In apps/api/.env set distinct local JWT_ACCESS_SECRET and OTP_PEPPER values.
docker compose up -d --wait
npm --prefix apps/api run db:deploy
node apps/api/scripts/init-local-s3.mjs
npm run demo:seed
npm run dev:demo
npm run maps:up
```

`dev:demo` starts the API, operations admin (`http://localhost:5173`) and
cafe/OWNER portal (`http://localhost:5174`) with colored terminal prefixes.
The API colors development request statuses and prints method, route template,
status and duration; it does not print request bodies, OTP codes or tokens.

The demo seed is limited to the local `sacakly` database and is safe to rerun:
existing sample orders and edited banners are kept rather than duplicated.
MinIO must be ready before seeding because the two bundled banner images are
stored through the API's media bucket. The home screen loads those banners from
`GET /marketing/banners`; choosing one opens its cafe. Cafe menus show the six
categories as filter chips and the 13 existing dishes. Use these fake phones
with the development OTP flow:

| Phone | Role | Demo content |
| --- | --- | --- |
| `+99365000001` | Customer | Two sample orders in the Flutter order list |
| `+99365000002` | Admin | Cafe memberships and sample orders in the admin panel |
| `+99365000003` | Customer | One sample order |

The local SMS code is shown by the admin login and, in Flutter debug builds,
on the customer login screen. No fixed OTP or password is created. The demo
orders use fake addresses and should never be used for dispatch or printing.
Flutter debug output marks successful API calls with 🟢 and failed calls with
🔴; it excludes request bodies and tokens.

If you start services separately instead, use:

```sh
npm run dev:merchant  # http://localhost:5174
npm run dev:admin     # http://localhost:5173
```

For an Android device connected with ADB, map its localhost to the Mac first:

```sh
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8080 tcp:8080
cd apps/customer
flutter run -d <device-id>
```

For a physical iPhone, use the Mac's LAN IP:

```sh
cd apps/customer
flutter run -d <device-id> \
  --dart-define=API_BASE_URL=http://<mac-lan-ip>:4000/api/v1/ \
  --dart-define=MAP_TILE_URL=http://<mac-lan-ip>:8080/styles/sacakly/{z}/{x}/{y}.png
```

The iOS app allows local networking for development. Accept the iOS local
network permission prompt when it appears. Android USB testing uses `adb
reverse` as shown above.

The API URL defaults to `http://127.0.0.1:4000/api/v1/`. Use an HTTPS API
URL for release builds. The local API uses `SMS_PROVIDER=console`; its
development OTP is returned only by the development API and displayed in the
debug login UI.
The map URL defaults to the local TileServer on port 8080. For an iPhone on
Wi-Fi, start TileServer with a LAN bind and allow the Mac's LAN address as
described in [MAPS](MAPS.md). For a release build use an HTTPS tile URL.

## Firebase and push

This app is registered in Firebase project `sacakly-customer-2026` for
Android (`tm.sacakly.sacakly_customer`) and iOS
(`tm.sacakly.sacaklyCustomer`). `flutterfire configure` generated
`lib/firebase_options.dart`, `android/app/google-services.json`, and
`ios/Runner/GoogleService-Info.plist`. The Android main manifest declares
`INTERNET` and `POST_NOTIFICATIONS`, including for release builds. iOS
deployment starts at version 15 because the installed Firebase SDK requires it.

The app requests notification permission, subscribes to the backend's public
campaign topic, shows foreground Android notifications, and sends its FCM
token to `PUT /notifications/devices` after sign-in. It removes the device
registration on sign-out. The API sends through FCM when `PUSH_PROVIDER=fcm`
and `FCM_SERVICE_ACCOUNT_BASE64` is set to a base64-encoded service account
JSON for this project. Keep that credential in the untracked `.env` or a
secret manager. iOS delivery also needs the Apple APNs authentication key in
Firebase Project settings → Cloud Messaging and Push Notifications enabled for
the bundle ID in Apple Developer. Test delivery on physical devices.

## Current flow

Select a cafe, add products from its menu, sign in by SMS, choose a delivery
point on the map or search for an address, request the server quote, and
confirm a cash order. The chosen coordinates and editable address are sent
together; moving the pin invalidates the old quote.
The cart is cleared when switching cafes. The API calculates all totals. A
retry of the same order uses the same idempotency key.
Orders open a tracking map with status, courier contact and fresh courier
location. During delivery, the customer-owned route endpoint returns the
remaining OSRM road geometry and its duration when routing is available.
The app refreshes every 15 seconds while the order is active; missing or old
GPS points are shown as unavailable, and no estimated time is invented.

This is a prototype. Turkish-only UI, basic order history and a full tenant
audit of legacy order/tracking endpoints need further work before release. Source mock
discounts are not seeded as live promotions; the backend owns discounts.
The historical order list endpoint still requires the tenant audit recorded
in `docs/mobile/CUSTOMER_APP.md`.
