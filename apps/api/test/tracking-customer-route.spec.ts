import { describe, expect, it, vi } from "vitest";
import { OrderStatus } from "../src/generated/prisma/client";
import { TrackingService } from "../src/tracking/tracking.service";
import { RoutingUnavailableError } from "../src/routing/routing.service";

const customer = { id: "customer-a" } as never;
const order = {
  courierId: "courier-a",
  status: OrderStatus.OUT_FOR_DELIVERY,
  latitude: 37.95,
  longitude: 58.34,
};

function setup(found: typeof order | null = order) {
  const prisma = { order: { findFirst: vi.fn().mockResolvedValue(found) } };
  const routing = { planDrivingRoute: vi.fn().mockResolvedValue({
    geometry: { type: "LineString", coordinates: [[58.32, 37.96], [58.34, 37.95]] },
    distanceMeters: 2500,
    durationSeconds: 420,
  }) };
  const service = new TrackingService(
    prisma as never, {} as never, {} as never, routing as never,
  );
  const location = vi.spyOn(service, "getCourierLocation").mockResolvedValue({
    latitude: 37.96,
    longitude: 58.32,
    recordedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  });
  return { service, prisma, routing, location };
}

describe("customer order tracking", () => {
  it("limits route to the customer's order and returns the road geometry", async () => {
    const { service, prisma, routing } = setup();
    await expect(service.customerCourierRoute(customer, "order-a")).resolves.toMatchObject({
      routingStatus: "READY",
      geometry: { coordinates: [[58.32, 37.96], [58.34, 37.95]] },
      durationSeconds: 420,
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-a", customerId: "customer-a" },
    }));
    expect(routing.planDrivingRoute).toHaveBeenCalledWith([
      { latitude: 37.96, longitude: 58.32 },
      { latitude: 37.95, longitude: 58.34 },
    ]);
  });

  it("rejects orders owned by another customer", async () => {
    const { service, routing } = setup(null);
    await expect(service.customerCourierRoute(customer, "foreign"))
      .rejects.toThrow("Order is not available for this customer");
    expect(routing.planDrivingRoute).not.toHaveBeenCalled();
  });

  it("does not route before pickup or from a stale courier point", async () => {
    const waiting = setup({ ...order, status: OrderStatus.COOKING });
    await expect(waiting.service.customerCourierRoute(customer, "order-a"))
      .resolves.toMatchObject({ routingStatus: "NO_COURIER", geometry: null });
    expect(waiting.routing.planDrivingRoute).not.toHaveBeenCalled();

    const stale = setup();
    vi.spyOn(stale.service, "getCourierLocation").mockResolvedValue({
      latitude: 37.96,
      longitude: 58.32,
      recordedAt: new Date(Date.now() - 120_000).toISOString(),
      receivedAt: new Date().toISOString(),
    });
    await expect(stale.service.customerCourierRoute(customer, "order-a"))
      .resolves.toMatchObject({ routingStatus: "NO_COURIER" });
    expect(stale.routing.planDrivingRoute).not.toHaveBeenCalled();
  });

  it("keeps tracking available when routing is down", async () => {
    const { service, routing } = setup();
    routing.planDrivingRoute.mockRejectedValue(new RoutingUnavailableError());
    await expect(service.customerCourierRoute(customer, "order-a"))
      .resolves.toMatchObject({ routingStatus: "UNAVAILABLE", geometry: null });
  });

  it("hides courier GPS after delivery and from other customers", async () => {
    const closed = setup({ ...order, status: OrderStatus.DELIVERED });
    await expect(closed.service.customerCourierLocation(customer, "order-a"))
      .resolves.toEqual({ location: null });
    expect(closed.location).not.toHaveBeenCalled();

    const foreign = setup(null);
    await expect(foreign.service.customerCourierLocation(customer, "foreign"))
      .rejects.toThrow("Order is not available for this customer");
  });
});
