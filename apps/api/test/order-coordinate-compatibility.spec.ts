import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateOrderDto } from "../src/orders/orders.dto";

const body = {
  items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
};

describe("legacy order coordinates", () => {
  it.each([
    {},
    { latitude: null, longitude: null },
    { latitude: null },
    { longitude: null },
  ])("treats absent or null coordinates as omitted: %j", (coordinates) => {
    const dto = plainToInstance(CreateOrderDto, { ...body, ...coordinates });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.latitude).toBeUndefined();
    expect(dto.longitude).toBeUndefined();
  });
  it.each([
    { latitude: 37.98 },
    { longitude: 58.34 },
    { latitude: 37.98, longitude: null },
    { latitude: null, longitude: 58.34 },
    { latitude: 91, longitude: 58.34 },
    { latitude: 37.98, longitude: 181 },
    { latitude: "invalid", longitude: "invalid" },
  ])("rejects incomplete or invalid coordinates: %j", (coordinates) => {
    const dto = plainToInstance(CreateOrderDto, { ...body, ...coordinates });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
  it.each([
    { latitude: 37.98, longitude: 58.34 },
    { latitude: 0, longitude: 0 },
  ])("keeps valid coordinates: %j", (coordinates) => {
    const dto = plainToInstance(CreateOrderDto, { ...body, ...coordinates });
    expect(validateSync(dto)).toEqual([]);
    expect(dto).toMatchObject(coordinates);
  });
});
