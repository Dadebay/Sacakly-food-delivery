import assert from "node:assert/strict";
import test from "node:test";
import { deliveryNightScheduleSchema, deliverySettingsFormSchema, deliveryEtrapFormSchema } from "../src/widgets/delivery-manager/model/delivery-form.ts";
import { quoteBoundaryDelay } from "../src/entities/delivery/model/quote-validity.ts";

const schedule = { version: 2, nightTariffEnabled: true, nightStartsAt: "23:00", nightEndsAt: "07:00" };
test("night schedule accepts midnight crossings and requires distinct valid times", () => {
  assert.deepEqual(deliveryNightScheduleSchema.parse(schedule), schedule);
  for (const patch of [{ nightStartsAt: "24:00" }, { nightStartsAt: "7:00" }, { nightEndsAt: "23:00" }, { version: 0 }]) {
    assert.equal(deliveryNightScheduleSchema.safeParse({ ...schedule, ...patch }).success, false);
  }
});
test("day and night fallback prices have independent free-delivery thresholds", () => {
  assert.deepEqual(deliverySettingsFormSchema.parse({ mapPricingEnabled: true, distancePricingEnabled: true, dayPricePerKilometer: "5", nightPricePerKilometer: "7,50", fallbackPrice: "15", fallbackFreeDeliveryThreshold: "150", fallbackNightPrice: "35,50", fallbackNightFreeDeliveryThreshold: "" }), { mapPricingEnabled: true, distancePricingEnabled: true, dayPricePerKilometer: 5, nightPricePerKilometer: 7.5, distancePriceTiers: [], fallbackPrice: 15, fallbackFreeDeliveryThreshold: 150, fallbackNightPrice: 35.5, fallbackNightFreeDeliveryThreshold: null });
});
test("district form preserves an independent night price and threshold", () => {
  const form = { welayatId: "1", nameEn: "", nameRu: "Район", nameTk: "Etrap", queuePosition: "", price: "20", freeDeliveryThreshold: "200", nightPrice: "40", nightFreeDeliveryThreshold: "400", isDeliveryEnabled: true };
  const result = deliveryEtrapFormSchema.parse(form);
  assert.equal(result.price, 20); assert.equal(result.nightPrice, 40); assert.equal(result.nightFreeDeliveryThreshold, 400);
  for (const price of ["-1", "1.111", "", "1000001"]) assert.equal(deliveryEtrapFormSchema.safeParse({ ...form, nightPrice: price }).success, false);
});
test("kilometer tiers accept editable fractional thresholds and validate ordered boundaries", () => {
  const form = { mapPricingEnabled: false, distancePricingEnabled: true, dayPricePerKilometer: "5", nightPricePerKilometer: "8", fallbackPrice: "15", fallbackFreeDeliveryThreshold: "", distancePriceTiers: [{ afterKilometers: "5", dayPricePerKilometer: "4", nightPricePerKilometer: "6" }, { afterKilometers: "10,50", dayPricePerKilometer: "3,50", nightPricePerKilometer: "5" }] };
  assert.deepEqual(deliverySettingsFormSchema.parse(form).distancePriceTiers, [{ afterKilometers: 5, dayPricePerKilometer: 4, nightPricePerKilometer: 6 }, { afterKilometers: 10.5, dayPricePerKilometer: 3.5, nightPricePerKilometer: 5 }]);
  for (const tiers of [[form.distancePriceTiers[0], form.distancePriceTiers[0]], [...form.distancePriceTiers].reverse(), [{ ...form.distancePriceTiers[0], afterKilometers: "" }], [{ ...form.distancePriceTiers[0], afterKilometers: "0" }], [{ ...form.distancePriceTiers[0], afterKilometers: "5.001" }], [{ ...form.distancePriceTiers[0], dayPricePerKilometer: "10001" }], [{ ...form.distancePriceTiers[0], nightPricePerKilometer: "0" }], Array.from({ length: 21 }, (_, i) => ({ ...form.distancePriceTiers[0], afterKilometers: String(i + 1) }))]) {
    assert.equal(deliverySettingsFormSchema.safeParse({ ...form, distancePriceTiers: tiers }).success, false);
  }
  assert.deepEqual(deliverySettingsFormSchema.parse({ ...form, distancePriceTiers: [] }).distancePriceTiers, []);
});
test("delivery quotes refresh at the server boundary without polling while disabled", () => {
  const now = Date.parse("2026-09-12T17:59:00Z");
  assert.equal(quoteBoundaryDelay("2026-09-12T18:00:00Z", now), 60100);
  assert.equal(quoteBoundaryDelay("2026-09-12T17:58:00Z", now), 1000);
  assert.equal(quoteBoundaryDelay(null, now), false);
  assert.equal(quoteBoundaryDelay(undefined, now), false);
  assert.equal(quoteBoundaryDelay("invalid", now), false);
});
