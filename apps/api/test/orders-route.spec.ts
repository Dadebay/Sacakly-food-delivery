import { OrderStatus, Role } from "../src/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { OrdersService } from "../src/orders/orders.service";
import {
  CourierRouteWaypointKind,
  CourierRoutingStatus,
} from "../src/orders/orders-response.dto";
import { RoutingUnavailableError } from "../src/routing/routing.service";

const courier = {
  id: "11111111-1111-4111-8111-111111111111",
  phone: "+99365000004",
  role: Role.COURIER,
};

const orders = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    number: 101,
    status: OrderStatus.ASSIGNED_TO_COURIER,
    address: "Client one",
    latitude: 37.93,
    longitude: 58.36,
    entrance: "2",
    floor: "4",
    apartment: "18",
    customerNote: "Call on arrival",
    assignedAt: new Date("2026-08-02T10:00:00.000Z"),
    branchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    branchName: "North",
    branchAddress: "Other branch street",
    branchLatitude: 37.99,
    branchLongitude: 58.42,
    customer: { phone: "+99365111111", firstName: "A", lastName: null },
    items: [{ productName: "Plov", quantity: 2 }],
    total: 50,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    number: 102,
    status: OrderStatus.OUT_FOR_DELIVERY,
    address: "Client two",
    latitude: 37.92,
    longitude: 58.35,
    entrance: null,
    floor: null,
    apartment: null,
    customerNote: null,
    assignedAt: new Date("2026-08-02T10:01:00.000Z"),
    branchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    branchName: "Central",
    branchAddress: "Branch street",
    branchLatitude: 37.95,
    branchLongitude: 58.38,
    customer: { phone: "+99365222222", firstName: "B", lastName: null },
    items: [{ productName: "Manty", quantity: 1 }],
    total: 75,
  },
];

function makeService(options?: { noOrders?: boolean; unavailable?: boolean }) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: courier.id }),
    },
    order: {
      findMany: vi.fn().mockResolvedValue(options?.noOrders ? [] : orders),
    },
  };
  const tracking = {
    getCourierLocation: vi.fn().mockResolvedValue({
      latitude: 37.96,
      longitude: 58.4,
      recordedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    }),
  };
  const routing = {
    planDrivingRoute: options?.unavailable
      ? vi.fn().mockRejectedValue(new RoutingUnavailableError())
      : vi.fn().mockImplementation((points: Array<Record<string, unknown>>) =>
          Promise.resolve({
            distanceMeters: 4_500,
            durationSeconds: 720,
            geometry: {
              type: "LineString",
              coordinates: points.map((point) => [
                point.longitude,
                point.latitude,
              ]),
            },
            waypoints: points.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
              distanceToRoadMeters: 0,
            })),
            legs: points.slice(1).map(() => ({
              distanceMeters: 1_500,
              durationSeconds: 240,
              summary: "",
              steps: [],
            })),
          }),
        ),
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    {} as never,
    tracking as never,
    routing as never,
  );
  return { service, prisma, routing, tracking };
}

describe("courier road route", () => {
  it("routes current position through each unique pickup before every delivery", async () => {
    const { service, routing } = makeService();

    const response = await service.courierRoute(courier);

    expect(routing.planDrivingRoute).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: CourierRouteWaypointKind.COURIER,
        latitude: 37.96,
        longitude: 58.4,
      }),
      expect.objectContaining({
        kind: CourierRouteWaypointKind.PICKUP,
        branchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      expect.objectContaining({
        kind: CourierRouteWaypointKind.DELIVERY,
        orderId: orders[0].id,
      }),
      expect.objectContaining({
        kind: CourierRouteWaypointKind.DELIVERY,
        orderId: orders[1].id,
      }),
    ]);
    expect(response).toMatchObject({
      courierId: courier.id,
      routingStatus: CourierRoutingStatus.READY,
      recalculateAfterSeconds: 15,
      stops: [
        {
          orderId: orders[0].id,
          entrance: "2",
          items: [{ productName: "Plov", quantity: 2 }],
        },
        { orderId: orders[1].id },
      ],
      route: {
        distanceMeters: 4_500,
        waypoints: [
          { sequence: 1, kind: CourierRouteWaypointKind.COURIER },
          { sequence: 2, kind: CourierRouteWaypointKind.PICKUP },
          { sequence: 3, kind: CourierRouteWaypointKind.DELIVERY },
          { sequence: 4, kind: CourierRouteWaypointKind.DELIVERY },
        ],
        nextWaypoints: [
          { sequence: 2, kind: CourierRouteWaypointKind.PICKUP },
          { sequence: 3, kind: CourierRouteWaypointKind.DELIVERY },
          { sequence: 4, kind: CourierRouteWaypointKind.DELIVERY },
        ],
      },
    });
    expect(response.route?.planId).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps assigned stops visible when road routing is unavailable", async () => {
    const { service } = makeService({ unavailable: true });

    await expect(service.courierRoute(courier)).resolves.toMatchObject({
      routingStatus: CourierRoutingStatus.UNAVAILABLE,
      route: null,
      stops: [{ orderId: orders[0].id }, { orderId: orders[1].id }],
    });
  });

  it("does not call the routing engine when the courier has no stops", async () => {
    const { service, routing } = makeService({ noOrders: true });

    await expect(service.courierRoute(courier)).resolves.toMatchObject({
      routingStatus: CourierRoutingStatus.NO_STOPS,
      route: null,
      stops: [],
    });
    expect(routing.planDrivingRoute).not.toHaveBeenCalled();
  });

  it("builds the dispatcher view from the same selected courier state", async () => {
    const { service, prisma } = makeService();

    const dispatcherResponse = await service.dispatchCourierRoute(courier.id);
    const courierResponse = await service.courierRoute(courier);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: courier.id, role: Role.COURIER, isActive: true },
      select: { id: true },
    });
    expect(dispatcherResponse.route?.planId).toBe(courierResponse.route?.planId);
    expect(dispatcherResponse.route?.geometry).toEqual(
      courierResponse.route?.geometry,
    );
    expect(dispatcherResponse.stops).toEqual(courierResponse.stops);
  });

  it("rejects an inactive or unknown courier in the dispatcher view", async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValueOnce(null);

    await expect(service.dispatchCourierRoute(courier.id)).rejects.toThrow(
      "Active courier not found",
    );
  });
});
