import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COURIER_LOCATION_OPTIONS,
  COURIER_LOCATION_UPDATE_INTERVAL_MS,
  courierLocationErrorMessage,
  startCourierLocationFeed,
  stopCourierLocationSession,
  toCourierLocationInput,
} from "../src/features/courier-location-sharing/model/location-sharing.ts";
import { applyDispatchLocationUpdate } from "../src/entities/courier/model/dispatch-location-update.ts";
import {
  courierLocationCoverage,
  courierMapLocations,
  courierName,
  courierOverviewCounts,
  courierRouteColor,
  courierRouteColors,
  courierWorkLabel,
  courierWorkState,
} from "../src/widgets/courier-map/model/courier-status.ts";

import { couriersOnMap } from "../src/widgets/courier-map/model/map-view.ts";

function courier(overrides = {}) {
  return {
    id: "courier-default",
    firstName: null,
    lastName: null,
    phone: "+99365000000",
    presence: "OFFLINE",
    location: null,
    rating: null,
    activeOrders: [],
    ...overrides,
  };
}

function position({
  latitude,
  longitude,
  accuracy = 12,
  heading = null,
  speed = null,
  timestamp,
}) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading,
      speed,
    },
    timestamp,
  };
}

test("courier workload distinguishes free couriers from one or several orders", () => {
  const free = { activeOrders: [], presence: "ONLINE" };
  const oneOrder = {
    activeOrders: [{ number: 179 }],
    presence: "ONLINE",
  };
  const severalOrders = {
    activeOrders: [{ number: 179 }, { number: 180 }],
    presence: "STALE",
  };

  assert.equal(courierWorkState(free), "FREE");
  assert.equal(courierWorkLabel(free), "Свободен");
  assert.equal(courierWorkState(oneOrder), "BUSY");
  assert.equal(courierWorkLabel(oneOrder), "В заказе #179");
  assert.equal(courierWorkLabel(severalOrders), "В заказах · 2");
});

test("overview gives all 16 demo couriers distinct colors and does not wrap the palette", () => {
  const assigned = courierRouteColors.map((_, index) =>
    courierRouteColor(index),
  );

  assert.equal(new Set(assigned).size, courierRouteColors.length);
  assert.ok(courierRouteColors.length >= 16);
  assert.equal(
    new Set(Array.from({ length: 150 }, (_, i) => courierRouteColor(i))).size,
    150,
  );
  assert.equal(courierRouteColor(2), assigned[2]);
});

test("courier overview counts workload, presence and GPS independently", () => {
  const counts = courierOverviewCounts([
    {
      activeOrders: [],
      presence: "ONLINE",
      location: { latitude: 37.96, longitude: 58.33 },
    },
    {
      activeOrders: [{ number: 179 }],
      presence: "STALE",
      location: { latitude: 37.97, longitude: 58.34 },
    },
    { activeOrders: [], presence: "OFFLINE", location: null },
    {
      activeOrders: [{ number: 180 }, { number: 181 }],
      presence: "ONLINE",
    },
  ]);

  assert.deepEqual(counts, {
    busy: 2,
    freeOnline: 1,
    located: 2,
    online: 2,
    total: 4,
  });
  assert.deepEqual(courierOverviewCounts([]), {
    busy: 0,
    freeOnline: 0,
    located: 0,
    online: 0,
    total: 0,
  });
});

test("map coverage keeps every courier in the list but creates points only from real GPS", () => {
  const couriers = [
    courier({
      id: "located",
      firstName: "Aman",
      lastName: "Orazov",
      presence: "ONLINE",
      location: {
        latitude: 37.9601,
        longitude: 58.3261,
        recordedAt: "2026-08-23T06:00:00.000Z",
        receivedAt: "2026-08-23T06:00:01.000Z",
      },
    }),
    courier({ id: "named-missing", firstName: "Mergen" }),
    courier({ id: "phone-missing", phone: "+99365000003" }),
  ];

  const locations = courierMapLocations(couriers);
  assert.deepEqual(
    locations.map(({ courier: item, latitude, longitude }) => ({
      id: item.id,
      latitude,
      longitude,
    })),
    [{ id: "located", latitude: 37.9601, longitude: 58.3261 }],
  );
  const coverage = courierLocationCoverage(couriers);
  assert.equal(coverage.located, 1);
  assert.equal(coverage.total, 3);
  assert.deepEqual(
    coverage.missing.map(({ id }) => id),
    ["named-missing", "phone-missing"],
  );
  assert.equal(courierName(couriers[0]), "Aman Orazov");
  assert.equal(courierName(couriers[1]), "Mergen");
  assert.equal(courierName(couriers[2]), "+99365000003");
  assert.deepEqual(courierLocationCoverage([]), {
    located: 0,
    total: 0,
    missing: [],
  });
});

test("live GPS update changes one courier without dropping free or missing couriers", () => {
  const untouchedMissing = courier({ id: "missing" });
  const freeAfterDelivery = courier({
    id: "moving",
    firstName: "Aman",
    presence: "STALE",
    activeOrders: [],
    location: {
      latitude: 37.95,
      longitude: 58.32,
      recordedAt: "2026-08-23T06:00:00.000Z",
      receivedAt: "2026-08-23T06:00:01.000Z",
    },
  });
  const snapshot = {
    generatedAt: "2026-08-23T06:00:01.000Z",
    courierUpdateIntervalSeconds: 15,
    branches: [],
    couriers: [freeAfterDelivery, untouchedMissing],
  };
  const nextLocation = {
    latitude: 37.96021,
    longitude: 58.39021,
    recordedAt: "2026-08-23T06:01:00.000Z",
    receivedAt: "2026-08-23T06:01:01.000Z",
  };

  const updated = applyDispatchLocationUpdate(snapshot, {
    courierId: "moving",
    location: nextLocation,
    sentAt: "2026-08-23T06:01:01.000Z",
  });
  assert.ok(updated);
  assert.notEqual(updated, snapshot);
  assert.equal(updated.couriers.length, 2);
  assert.deepEqual(updated.couriers[1], untouchedMissing);
  assert.deepEqual(updated.couriers[0], {
    ...freeAfterDelivery,
    presence: "ONLINE",
    location: nextLocation,
  });
  assert.deepEqual(updated.couriers[0].activeOrders, []);

  const stopped = applyDispatchLocationUpdate(updated, {
    courierId: "moving",
    location: null,
    sentAt: "2026-08-23T06:02:00.000Z",
  });
  assert.ok(stopped);
  assert.equal(stopped.couriers[0].presence, "OFFLINE");
  assert.equal(stopped.couriers[0].location, null);
  assert.equal(
    applyDispatchLocationUpdate(snapshot, {
      courierId: "new-courier-not-in-snapshot",
      location: nextLocation,
      sentAt: "2026-08-23T06:01:01.000Z",
    }),
    null,
  );
});

test("courier feed publishes immediately, continues after delivery and cleans up the shift", () => {
  const initial = position({
    latitude: 37.95,
    longitude: 58.32,
    timestamp: Date.parse("2026-08-23T06:00:00.000Z"),
  });
  const afterDelivery = position({
    latitude: 37.96021,
    longitude: 58.39021,
    accuracy: 8,
    heading: 90,
    speed: 4.5,
    timestamp: Date.parse("2026-08-23T06:01:00.000Z"),
  });
  const published = [];
  const errors = [];
  const clearedWatches = [];
  const clearedIntervals = [];
  let watchSuccess;
  let watchError;
  let poll;
  let getCurrentSuccess;
  let getCurrentError;
  const geolocation = {
    watchPosition(success, error, options) {
      watchSuccess = success;
      watchError = error;
      assert.equal(options, COURIER_LOCATION_OPTIONS);
      return 71;
    },
    clearWatch(watchId) {
      clearedWatches.push(watchId);
    },
    getCurrentPosition(success, error, options) {
      getCurrentSuccess = success;
      getCurrentError = error;
      assert.equal(options, COURIER_LOCATION_OPTIONS);
    },
  };
  const intervals = {
    setInterval(callback, intervalMs) {
      poll = callback;
      assert.equal(intervalMs, COURIER_LOCATION_UPDATE_INTERVAL_MS);
      return 72;
    },
    clearInterval(intervalId) {
      clearedIntervals.push(intervalId);
    },
  };

  const stop = startCourierLocationFeed({
    geolocation,
    intervals,
    publish: (next) => published.push(next),
    reportError: (error) => errors.push(error.code),
  });
  watchSuccess(initial);
  watchSuccess(afterDelivery);
  assert.deepEqual(published, [initial]);

  poll();
  getCurrentSuccess(afterDelivery);
  assert.deepEqual(published, [initial, afterDelivery]);
  watchError({ code: 1 });
  getCurrentError({ code: 2 });
  assert.deepEqual(errors, [1, 2]);

  stop();
  assert.deepEqual(clearedWatches, [71]);
  assert.deepEqual(clearedIntervals, [72]);
  watchSuccess(afterDelivery);
  getCurrentSuccess(afterDelivery);
  watchError({ code: 1 });
  getCurrentError({ code: 2 });
  poll();
  stop();
  assert.deepEqual(published, [initial, afterDelivery]);
  assert.deepEqual(errors, [1, 2]);
  assert.deepEqual(clearedWatches, [71]);
  assert.deepEqual(clearedIntervals, [72]);
});

test("ending a courier shift waits for an in-flight GPS write before clearing the marker", async () => {
  const events = [];
  let finishPublish;
  const pendingPublish = new Promise((resolve) => {
    finishPublish = () => {
      events.push("publish-finished");
      resolve();
    };
  });

  const stopping = stopCourierLocationSession({
    stopFeed: () => events.push("feed-stopped"),
    pendingPublish,
    clearLocation: async () => events.push("location-cleared"),
  });
  await Promise.resolve();
  assert.deepEqual(events, ["feed-stopped"]);

  finishPublish();
  await stopping;
  assert.deepEqual(events, [
    "feed-stopped",
    "publish-finished",
    "location-cleared",
  ]);

  await stopCourierLocationSession({
    stopFeed: null,
    pendingPublish: Promise.reject(new Error("network stopped")),
    clearLocation: async () => events.push("failed-write-cleared"),
  });
  assert.equal(events.at(-1), "failed-write-cleared");
});

test("courier GPS payload keeps valid sensor data and rejects non-finite optional values", () => {
  const timestamp = Date.parse("2026-08-23T06:01:00.000Z");
  assert.deepEqual(
    toCourierLocationInput(
      position({
        latitude: 37.96021,
        longitude: 58.39021,
        accuracy: 8,
        heading: 90,
        speed: 4.5,
        timestamp,
      }),
    ),
    {
      latitude: 37.96021,
      longitude: 58.39021,
      accuracy: 8,
      heading: 90,
      speed: 4.5,
      recordedAt: "2026-08-23T06:01:00.000Z",
    },
  );
  assert.deepEqual(
    toCourierLocationInput(
      position({
        latitude: 37.96,
        longitude: 58.39,
        accuracy: Number.NaN,
        heading: Number.POSITIVE_INFINITY,
        speed: Number.NaN,
        timestamp,
      }),
    ),
    {
      latitude: 37.96,
      longitude: 58.39,
      recordedAt: "2026-08-23T06:01:00.000Z",
    },
  );
  assert.equal(
    courierLocationErrorMessage(1),
    "Доступ к геолокации запрещён. Разрешите его в настройках браузера.",
  );
  assert.equal(
    courierLocationErrorMessage(2),
    "Не удалось получить свежую GPS-точку.",
  );
});

test("dispatch map renders backend road geometry instead of joining order points", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/courier-map/ui/courier-map-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /\bPolyline\b/);
  assert.match(source, /route\.route\.geometry\.coordinates/);
  assert.match(source, /\[longitude, latitude\]/);
  assert.match(source, /courierMapLocations\(couriers\)/);
  assert.match(source, /location\.latitude/);
  assert.match(source, /order\.latitude/);
  assert.match(source, /branch\.latitude/);
});

test("dispatch and branch maps keep an operational working height", async () => {
  const styles = await readFile(
    new URL("../src/app/styles/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /height: clamp\(640px, 76vh, 920px\)/);
  assert.match(styles, /height: clamp\(560px, 68vh, 820px\)/);
});

test("dispatch applies authenticated server-pushed GPS events to TanStack cache", async () => {
  const liveSource = await readFile(
    new URL("../src/entities/courier/api/dispatch-live.ts", import.meta.url),
    "utf8",
  );
  const panel = await readFile(
    new URL(
      "../src/widgets/courier-map/ui/courier-map-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const querySource = await readFile(
    new URL("../src/entities/courier/api/dispatch-query.ts", import.meta.url),
    "utf8",
  );

  assert.match(liveSource, /\/tracking\/dispatch\/live/);
  assert.match(liveSource, /openApiEventStream/);
  assert.match(liveSource, /setQueryData<DispatchSnapshot>/);
  assert.match(
    liveSource,
    /courierQueryKeys\.route\(userId, event.courierId\)/,
  );
  assert.doesNotMatch(liveSource, /routeOverview/);
  assert.match(querySource, /useQueries/);
  assert.match(panel, /const showRoutes = params.get\("routes"\) !== "hide"/);
  assert.match(querySource, /\/orders\/couriers\/\$\{courierId\}\/route/);
  assert.match(panel, /useDispatchLiveUpdates/);
  assert.match(panel, /useCourierRoute/);
  assert.match(panel, /useCourierRoutes/);
  assert.match(panel, /dispatch-route-summary/);
});

test("map filter shows all couriers or exactly the requested courier, including missing GPS", () => {
  const busy = courier({ id: "busy", activeOrders: [{ number: 42 }] });
  const free = courier({ id: "free", presence: "ONLINE" });
  const couriers = [busy, free];
  assert.equal(couriersOnMap(couriers, null), couriers);
  assert.deepEqual(couriersOnMap(couriers, "busy"), [busy]);
  assert.deepEqual(couriersOnMap(couriers, "free"), [free]);
  assert.deepEqual(couriersOnMap(couriers, "removed"), []);
});

test("overlapping couriers remain individually reachable without inventing missing GPS", () => {
  const couriers = [
    courier({ id: "a", location: { latitude: 37.96, longitude: 58.33 } }),
    courier({ id: "b", location: { latitude: 37.96, longitude: 58.33 } }),
    courier({ id: "far", location: { latitude: 38.5, longitude: 59.5 } }),
    courier({ id: "missing" }),
  ];
  const markers = courierMapLocations(couriers);
  assert.deepEqual(
    markers.map(({ courier }) => courier.id),
    ["a", "b", "far"],
  );
  assert.equal(markers[0].latitude, markers[1].latitude);
  assert.equal(markers[0].longitude, markers[1].longitude);
  const many = Array.from({ length: 150 }, (_, index) =>
    courier({
      id: `courier-${index}`,
      location: { latitude: 37.96, longitude: 58.33 },
    }),
  );
  assert.equal(courierMapLocations(many).length, 150);
});

test("courier GPS remains a whole-shift feed after an order is delivered", async () => {
  const [sharing, app, sessionAccess, context, mobileContract, qaContract] =
    await Promise.all([
      readFile(
        new URL(
          "../src/features/courier-location-sharing/ui/courier-location-sharing.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../src/app/ui/app.tsx", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../src/shared/auth/model/admin-portal-access.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../../docs/legacy/PROJECT_CONTEXT.md", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../docs/MOBILE_DELIVERY_AND_COURIER_UPDATE.md",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../docs/COURIER_MAP_AND_PRINTER_ROUTING_QA.md",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.equal(COURIER_LOCATION_UPDATE_INTERVAL_MS, 15_000);
  assert.match(sharing, /startCourierLocationFeed/);
  assert.match(sharing, /data-testid="courier-location-sharing"/);
  assert.match(sharing, /data-testid="courier-location-sharing-start"/);
  assert.match(sharing, /data-testid="courier-location-sharing-stop"/);
  assert.match(sharing, /даже без активного заказа/);
  assert.match(sharing, /Не выключайте геолокацию после доставки/);
  assert.match(sharing, /Начать смену и показать себя на карте/);
  assert.match(app, /path="\/courier"/);
  assert.match(sessionAccess, /"COURIER"/);
  assert.match(context, /after an order becomes `DELIVERED`/);
  assert.match(context, /COURIER_MAP_AND_PRINTER_ROUTING_QA\.md/);
  assert.match(
    mobileContract,
    /Завершение доставки не\s+должно останавливать GPS/,
  );
  assert.match(qaContract, /may continue publishing new points after delivery/);
  assert.match(
    qaContract,
    /product\.receiptPrinterIp \?\? category\.receiptPrinterIp/,
  );
});

test("legacy admin ingress retains the raster contract without a platform deploy", async () => {
  const adminConfig = await readFile(
    new URL("../src/shared/map/config.ts", import.meta.url),
    "utf8",
  );
  const httpNginx = await readFile(
    new URL(
      "../../../docs/legacy/deploy/nginx/alowalow-http-temporary.conf",
      import.meta.url,
    ),
    "utf8",
  );
  const tlsNginx = await readFile(
    new URL("../../../docs/legacy/deploy/nginx/alowalow-production.conf", import.meta.url),
    "utf8",
  );
  const workflow = await readFile(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    adminConfig,
    /DEFAULT_TILE_URL = "\/tile\/\{z\}\/\{x\}\/\{y\}\.png"/,
  );
  for (const nginx of [httpNginx, tlsNginx]) {
    assert.match(nginx, /location ~ "\^\/tile\/\(\[0-9\]\{1,2\}\)/);
    assert.match(
      nginx,
      /rewrite "\^\/tile\/.+" \/styles\/alowalow\/\$1\/\$2\/\$3\.png break;/,
    );
    assert.match(nginx, /proxy_hide_header Access-Control-Allow-Origin/);
    assert.match(nginx, /Access-Control-Allow-Origin "\*" always/);
  }
  assert.doesNotMatch(workflow, /sudo systemctl reload nginx|VITE_MAP_TILE_URL|deploy:/);
});

test("dispatcher GPS help describes the mobile app without requiring a website shift", async () => {
  const panel = await readFile(new URL("../src/widgets/courier-map/ui/courier-map-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /из приложения курьера во время смены/);
  assert.doesNotMatch(panel, /a7-tagam\.com\.tm\/courier|Начать смену|Видимые служебные точки/);
});
