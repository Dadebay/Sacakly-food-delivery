import { describe, expect, it } from "vitest";
import {
  deliveryZoneValidationError,
  deliveryZonesOverlap,
  findDeliveryAreaForCoordinates,
  normalizeDeliveryZone,
  pointInDeliveryZone,
} from "../src/delivery/delivery-zone";

const square = [
  { latitude: 37.95, longitude: 58.35 },
  { latitude: 37.95, longitude: 58.4 },
  { latitude: 38, longitude: 58.4 },
  { latitude: 38, longitude: 58.35 },
];

describe("delivery map zones", () => {
  it("normalizes a closed ring and resolves inside, outside and boundary points", () => {
    const closed = normalizeDeliveryZone([...square, square[0]!]);
    expect(closed).toEqual(square);
    expect(
      pointInDeliveryZone({ latitude: 37.97, longitude: 58.37 }, closed),
    ).toBe(true);
    expect(
      pointInDeliveryZone({ latitude: 37.94, longitude: 58.37 }, closed),
    ).toBe(false);
    expect(
      pointInDeliveryZone({ latitude: 37.95, longitude: 58.37 }, closed),
    ).toBe(true);
  });

  it("rejects incomplete, zero-area and self-crossing polygons", () => {
    expect(deliveryZoneValidationError(square.slice(0, 2))).toMatch(/3 points/);
    expect(
      deliveryZoneValidationError([
        { latitude: 1, longitude: 1 },
        { latitude: 2, longitude: 2 },
        { latitude: 3, longitude: 3 },
      ]),
    ).toMatch(/non-zero area/);
    expect(
      deliveryZoneValidationError([
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        { latitude: 0, longitude: 1 },
        { latitude: 1, longitude: 0 },
      ]),
    ).toMatch(/cross/);
    expect(deliveryZoneValidationError([...square, square[1]!])).toMatch(
      /duplicate/,
    );
  });

  it("allows shared borders but detects overlapping tariff areas", () => {
    const adjacent = square.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude + 0.05,
    }));
    const overlapping = square.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude + 0.02,
    }));
    expect(deliveryZonesOverlap(square, adjacent)).toBe(false);
    expect(deliveryZonesOverlap(square, overlapping)).toBe(true);
    expect(
      deliveryZonesOverlap(square, [
        { latitude: 37.95, longitude: 58.39 },
        { latitude: 37.95, longitude: 58.44 },
        { latitude: 38, longitude: 58.44 },
        { latitude: 38, longitude: 58.39 },
      ]),
    ).toBe(true);
  });

  it("matches coordinates only when exactly one configured zone contains them", () => {
    const candidates = [
      { id: 1, deliveryZone: square },
      { id: 2, deliveryZone: null },
    ];
    expect(
      findDeliveryAreaForCoordinates(candidates, {
        latitude: 37.97,
        longitude: 58.37,
      })?.id,
    ).toBe(1);
    expect(
      findDeliveryAreaForCoordinates(candidates, {
        latitude: 37.8,
        longitude: 58.1,
      }),
    ).toBeNull();
  });
});
