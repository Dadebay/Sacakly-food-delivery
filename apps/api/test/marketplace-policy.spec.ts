import { describe, expect, it } from "vitest";
import { Role } from "../src/generated/prisma/client";
import {
  assertApprovedCourier,
  assertCafeMember,
  assertModuleEnabled,
  assertPlatformOwner,
  requireSingleCafe,
} from "../src/marketplace/marketplace-policy";

const cafeA = "00000000-0000-4000-8000-000000000010";
const cafeB = "00000000-0000-4000-8000-000000000020";

describe("marketplace tenant policy", () => {
  it("accepts an order only when every item belongs to one cafe", () => {
    expect(requireSingleCafe([{ cafeId: cafeA }, { cafeId: cafeA }])).toBe(cafeA);
    expect(() => requireSingleCafe([])).toThrow();
    expect(() => requireSingleCafe([{ cafeId: cafeA }, { cafeId: cafeB }])).toThrow();
  });

  it("requires an active membership for the requested cafe and action role", () => {
    const member = { userId: "user-1", cafeId: cafeA, role: Role.ADMIN, isActive: true };
    expect(() => assertCafeMember("user-1", cafeA, member, [Role.ADMIN])).not.toThrow();
    expect(() => assertCafeMember("user-1", cafeB, member, [Role.ADMIN])).toThrow();
    expect(() => assertCafeMember("user-2", cafeA, member, [Role.ADMIN])).toThrow();
    expect(() => assertCafeMember("user-1", cafeA, { ...member, isActive: false }, [Role.ADMIN])).toThrow();
    expect(() => assertCafeMember("user-1", cafeA, member, [Role.COOK])).toThrow();
    expect(() => assertCafeMember("user-1", cafeA, null, [Role.ADMIN])).toThrow();
  });

  it("requires both the persisted owner entitlement and the configured phone", () => {
    const ownerPhone = "+99362969614";
    const actor = { id: "owner-id", phone: ownerPhone, role: Role.SUPER_ADMIN, isActive: true };
    const entitlement = { userId: actor.id, phone: ownerPhone, isActive: true };
    expect(() => assertPlatformOwner(actor, entitlement, ownerPhone)).not.toThrow();
    expect(() => assertPlatformOwner(actor, null, ownerPhone)).toThrow();
    expect(() => assertPlatformOwner({ ...actor, id: "other" }, entitlement, ownerPhone)).toThrow();
    expect(() => assertPlatformOwner({ ...actor, isActive: false }, entitlement, ownerPhone)).toThrow();
    expect(() => assertPlatformOwner({ ...actor, role: Role.CUSTOMER }, entitlement, ownerPhone)).toThrow();
    expect(() => assertPlatformOwner(actor, entitlement, "+99360000000")).toThrow();
  });

  it("denies disabled cafe modules and unapproved couriers", () => {
    expect(() => assertModuleEnabled({ cafeId: cafeA, enabled: true }, cafeA)).not.toThrow();
    expect(() => assertModuleEnabled({ cafeId: cafeA, enabled: true }, cafeB)).toThrow();
    expect(() => assertModuleEnabled({ cafeId: cafeA, enabled: false }, cafeA)).toThrow();
    expect(() => assertModuleEnabled(null, cafeA)).toThrow();
    expect(() => assertApprovedCourier({ userId: "courier", status: "APPROVED" }, "courier")).not.toThrow();
    expect(() => assertApprovedCourier({ userId: "courier", status: "PENDING" }, "courier")).toThrow();
    expect(() => assertApprovedCourier({ userId: "courier", status: "APPROVED" }, "other")).toThrow();
    expect(() => assertApprovedCourier(null, "courier")).toThrow();
  });
});
