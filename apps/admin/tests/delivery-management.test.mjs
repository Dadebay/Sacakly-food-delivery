import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deliveryFeeForSubtotal,
  findDeliveryEtrapForAddress,
  flattenDeliveryEtraps,
} from "../src/entities/delivery/model/types.ts";
import {
  deliveryEtrapFormSchema,
  deliveryWelayatFormSchema,
} from "../src/widgets/delivery-manager/model/delivery-form.ts";
import {
  createStarterDeliveryZone,
  findExistingZoneForSuggestion,
  findWelayatForZoneSuggestion,
  insertDeliveryZonePointAtNearestEdge,
  replaceDeliveryZonePoint,
  scaleDeliveryZone,
} from "../src/widgets/delivery-manager/model/delivery-zone-editor.ts";

const config = {
  fallbackPrice: 15,
  fallbackFreeDeliveryThreshold: 150,
  welayats: [
    {
      id: 1,
      nameEn: "Ashgabat",
      nameRu: "Ашхабад",
      nameTk: "Aşgabat",
      sortOrder: 1,
      etraps: [
        {
          id: 25,
          welayatId: 1,
          nameEn: "1 Microdistrict",
          nameRu: "1 мкр",
          nameTk: "1-nji etrapça",
          queuePosition: 0,
          price: 20,
          freeDeliveryThreshold: 200,
          isDeliveryEnabled: true,
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
        {
          id: 313,
          welayatId: 1,
          nameEn: null,
          nameRu: "ул. Кемине (район бывшей стеколки)",
          nameTk: "Kemine köç. (öňki Aýna kombinat)",
          queuePosition: null,
          price: 15,
          freeDeliveryThreshold: 150,
          isDeliveryEnabled: true,
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    },
  ],
};

test("delivery estimate follows the selected backend config projection", () => {
  const [etrap] = flattenDeliveryEtraps(config);
  assert.equal(etrap.welayatNameRu, "Ашхабад");
  assert.equal(deliveryFeeForSubtotal(199.99, etrap), 20);
  assert.equal(deliveryFeeForSubtotal(200, etrap), 0);
  assert.equal(
    deliveryFeeForSubtotal(1_000, {
      price: 25,
      freeDeliveryThreshold: null,
    }),
    25,
  );
});

test("a map-picked district reuses its administrative parent and existing row", () => {
  const welayats = [
    {
      id: 1,
      nameEn: "Ashgabat",
      nameRu: "Ашхабад",
      nameTk: "Aşgabat",
      sortOrder: 1,
      etraps: [],
    },
    {
      id: 2,
      nameEn: "Ahal",
      nameRu: "Ахал",
      nameTk: "Ahal",
      sortOrder: 2,
      etraps: [],
    },
  ];
  const suggestion = {
    label: "Аркадаг, Ахалский велаят, Туркмения",
    nameRu: "Аркадаг",
    nameTk: "Arkadag",
    nameEn: "Arkadag",
    boundary: [
      { latitude: 38.01, longitude: 58.01 },
      { latitude: 38.02, longitude: 58.02 },
      { latitude: 38.01, longitude: 58.03 },
    ],
    provider: "NOMINATIM",
  };
  const ahal = findWelayatForZoneSuggestion(welayats, suggestion);
  assert.equal(ahal?.id, 2);
  assert.equal(
    findExistingZoneForSuggestion(
      [
        {
          id: 208,
          welayatId: 2,
          welayatNameRu: "Ахал",
          welayatNameTk: "Ahal",
          nameRu: "Аркадаг",
          nameTk: "Arkadag",
          nameEn: null,
        },
      ],
      suggestion,
      ahal?.id,
    )?.id,
    208,
  );
});

test("address text suggests one unambiguous configured tariff zone", () => {
  const match = findDeliveryEtrapForAddress(config, [
    "Kemine (2035) köçesi, Berkararlyk etraby, Aşgabat şäheri, 425648, Türkmenistan",
  ]);

  assert.equal(match?.id, 313);
  assert.equal(match?.price, 15);
  assert.equal(
    findDeliveryEtrapForAddress(config, ["Неизвестный адрес"]),
    null,
  );
});

test("ambiguous address text preserves the backend fallback tariff", () => {
  const ambiguousConfig = structuredClone(config);
  ambiguousConfig.welayats[0].etraps.push({
    ...ambiguousConfig.welayats[0].etraps[1],
    id: 314,
    nameRu: "Кемине",
    nameTk: "Kemine",
  });

  assert.equal(
    findDeliveryEtrapForAddress(ambiguousConfig, ["Kemine köçesi"]),
    null,
  );
});

test("delivery directory forms validate and normalize every admin-managed field", () => {
  assert.deepEqual(
    deliveryWelayatFormSchema.parse({
      nameEn: " Test region ",
      nameRu: " Новый велаят ",
      nameTk: " Täze welaýat ",
      sortOrder: "8",
    }),
    {
      nameEn: "Test region",
      nameRu: "Новый велаят",
      nameTk: "Täze welaýat",
      sortOrder: 8,
    },
  );
  assert.equal(
    deliveryWelayatFormSchema.safeParse({
      nameEn: "",
      nameRu: "",
      nameTk: "Täze welaýat",
      sortOrder: "1",
    }).success,
    false,
  );
  assert.deepEqual(
    deliveryEtrapFormSchema.parse({
      welayatId: "2",
      nameEn: "",
      nameRu: "Новый район",
      nameTk: "Täze etrap",
      queuePosition: "",
      price: "24,50",
      freeDeliveryThreshold: "",
      isDeliveryEnabled: true,
    }),
    {
      welayatId: 2,
      nameEn: null,
      nameRu: "Новый район",
      nameTk: "Täze etrap",
      queuePosition: null,
      price: 24.5,
      freeDeliveryThreshold: null,
      isDeliveryEnabled: true,
    },
  );
});

test("dragging one delivery-zone vertex preserves the ordered polygon", () => {
  const points = [
    { latitude: 37.9, longitude: 58.3 },
    { latitude: 37.91, longitude: 58.31 },
    { latitude: 37.92, longitude: 58.32 },
  ];

  const moved = replaceDeliveryZonePoint(points, 1, {
    latitude: 37.915,
    longitude: 58.315,
  });

  assert.deepEqual(moved, [
    points[0],
    { latitude: 37.915, longitude: 58.315 },
    points[2],
  ]);
  assert.notEqual(moved, points);
  assert.deepEqual(points[1], { latitude: 37.91, longitude: 58.31 });
});

test("a named place without an OSM polygon gets an editable starter contour", () => {
  const center = { latitude: 37.97, longitude: 58.4 };
  const starter = createStarterDeliveryZone(center);

  assert.equal(starter.length, 8);
  assert.equal(new Set(starter.map(JSON.stringify)).size, 8);
  assert.equal(starter[0].latitude, center.latitude);
  assert.ok(starter[0].longitude > center.longitude);
  assert.ok(starter.some(({ latitude }) => latitude > center.latitude));
  assert.ok(starter.some(({ latitude }) => latitude < center.latitude));
  assert.ok(starter.every(({ latitude, longitude }) =>
    Number.isFinite(latitude) && Number.isFinite(longitude)
  ));
});

test("delivery-zone scaling preserves its center and changes its footprint", () => {
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
    { latitude: 2, longitude: 2 },
    { latitude: 2, longitude: 0 },
  ];

  const smaller = scaleDeliveryZone(points, 0.8);
  const larger = scaleDeliveryZone(points, 1.25);

  assert.deepEqual(smaller, [
    { latitude: 0.2, longitude: 0.2 },
    { latitude: 0.2, longitude: 1.8 },
    { latitude: 1.8, longitude: 1.8 },
    { latitude: 1.8, longitude: 0.2 },
  ]);
  assert.deepEqual(larger, [
    { latitude: -0.25, longitude: -0.25 },
    { latitude: -0.25, longitude: 2.25 },
    { latitude: 2.25, longitude: 2.25 },
    { latitude: 2.25, longitude: -0.25 },
  ]);
});

test("a map click inserts a vertex into the nearest polygon side", () => {
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
    { latitude: 2, longitude: 2 },
    { latitude: 2, longitude: 0 },
  ];
  const inserted = { latitude: 0.1, longitude: 1 };

  assert.deepEqual(insertDeliveryZonePointAtNearestEdge(points, inserted), [
    points[1],
    points[2],
    points[3],
    points[0],
    inserted,
  ]);
});

test("delivery manager reads and writes the real API with stable selectors", async () => {
  const [queries, actions, manager, zoneMap] = await Promise.all([
    readFile(
      new URL(
        "../src/entities/delivery/api/delivery-queries.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/delivery-management/api/use-delivery-actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/delivery-manager/ui/delivery-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/delivery-manager/ui/delivery-zone-map.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(queries, /"\/delivery\/config"/);
  assert.match(queries, /"\/delivery\/admin\/config"/);
  assert.doesNotMatch(queries, /etrap-boundaries/);
  assert.match(actions, /\/delivery\/admin\/settings/);
  assert.match(actions, /\/delivery\/admin\/welayats/);
  assert.match(actions, /\/delivery\/admin\/welayats\/\$\{id\}/);
  assert.match(actions, /\/delivery\/admin\/etraps"/);
  assert.match(actions, /\/delivery\/admin\/etraps\/\$\{id\}/);
  assert.match(actions, /\/delivery\/admin\/zone-suggestion/);
  assert.match(manager, /data-testid="delivery-settings-form"/);
  assert.match(manager, /data-testid="delivery-welayat-form"/);
  assert.match(manager, /data-testid="delivery-welayat-create"/);
  assert.match(manager, /data-testid="delivery-etrap-form"/);
  assert.match(manager, /data-testid="delivery-etrap-create-manual"/);
  assert.match(manager, /data-testid="delivery-etrap-welayat"/);
  assert.match(manager, /data-testid="delivery-etrap-name-ru"/);
  assert.match(manager, /data-testid="delivery-etrap-search"/);
  assert.match(manager, /data-testid="delivery-zone-overview"/);
  assert.match(manager, /data-testid="delivery-map-zone-select"/);
  assert.match(manager, /data-testid="delivery-map-zone-select-hint"/);
  assert.match(manager, /data-testid="delivery-map-zone-select-result"/);
  assert.doesNotMatch(manager, /Этрапы-ориентиры|этрапа Ашхабада/);
  assert.match(manager, /data-testid="delivery-zone-editor"/);
  assert.match(manager, /data-testid="delivery-zone-discover"/);
  assert.match(manager, /data-testid="delivery-zone-discovery-hint"/);
  assert.match(manager, /data-testid="delivery-zone-discovery-result"/);
  assert.match(manager, /data-testid="delivery-map-pricing-enabled"/);
  assert.match(manager, /deliveryZone: zoneDraft\.length >= 3/);
  assert.match(zoneMap, /data-testid="delivery-zone-map"/);
  assert.match(zoneMap, /data-testid="delivery-zone-map-undo"/);
  assert.match(zoneMap, /data-testid="delivery-zone-map-clear"/);
  assert.match(zoneMap, /data-testid="delivery-zone-map-shrink"/);
  assert.match(zoneMap, /data-testid="delivery-zone-map-grow"/);
  assert.match(zoneMap, /draggable=\{editable && !discoveryMode\}/);
  assert.match(zoneMap, /delivery-zone-map-point-/);
  assert.doesNotMatch(zoneMap, /etrapBoundaries|delivery-etrap-context/);
  assert.match(zoneMap, /insertDeliveryZonePointAtNearestEdge/);
  assert.match(zoneMap, /scaleDeliveryZone/);
  assert.match(zoneMap, /dragend\(event\)/);
  assert.match(zoneMap, /fittedRevision\.current === revision/);
  assert.match(manager, /setZoneFitRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(zoneMap, /<Polygon/);
  assert.match(manager, /getRowId=\{\(etrap\) => String\(etrap\.id\)\}/);
});
