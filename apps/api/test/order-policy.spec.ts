import { describe, expect, it } from "vitest";
import { OrderStatus, Role } from "../src/generated/prisma/client";
import {
  allowedOrderTransitions,
  assertOrderTransition,
  canAdministratorEditOrder,
  canAdministratorCompleteOrder,
  canCancelOrder,
  canEditCourierAssignment,
  canManageCourierAssignment,
  CUSTOMER_CANCELLATION_WINDOW_MS,
} from "../src/orders/order-policy";

describe("order workflow policy", () => {
  const expected = new Map<string, OrderStatus | OrderStatus[]>([
    [`${OrderStatus.READY}:${Role.ADMIN}`, OrderStatus.COOKING],
    [`${OrderStatus.READY}:${Role.SUPER_ADMIN}`, OrderStatus.COOKING],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.COURIER}`,
      OrderStatus.OUT_FOR_DELIVERY,
    ],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.ADMIN}`,
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
    ],
    [
      `${OrderStatus.ASSIGNED_TO_COURIER}:${Role.SUPER_ADMIN}`,
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
    ],
    [`${OrderStatus.OUT_FOR_DELIVERY}:${Role.COURIER}`, OrderStatus.DELIVERED],
    [`${OrderStatus.OUT_FOR_DELIVERY}:${Role.ADMIN}`, OrderStatus.DELIVERED],
    [
      `${OrderStatus.OUT_FOR_DELIVERY}:${Role.SUPER_ADMIN}`,
      OrderStatus.DELIVERED,
    ],
    [`${OrderStatus.DELIVERED}:${Role.COURIER}`, OrderStatus.CASH_RETURNED],
    [`${OrderStatus.DELIVERED}:${Role.ADMIN}`, OrderStatus.CASH_RETURNED],
    [`${OrderStatus.DELIVERED}:${Role.SUPER_ADMIN}`, OrderStatus.CASH_RETURNED],
    [
      `${OrderStatus.CASH_RETURNED}:${Role.SUPER_ADMIN}`,
      OrderStatus.RECONCILED,
    ],
  ]);

  it("keeps the complete status and role matrix deny-by-default", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        const target = expected.get(`${status}:${role}`);
        expect(
          allowedOrderTransitions(status, role),
          `${role} from ${status}`,
        ).toEqual(target ? (Array.isArray(target) ? target : [target]) : []);
      }
    }
  });

  it("throws on a forbidden workflow transition", () => {
    expect(() =>
      assertOrderTransition(
        OrderStatus.COOKING,
        OrderStatus.READY,
        Role.COURIER,
      ),
    ).toThrow("cannot move an order");
  });

  it("forbids every backward transition after courier pickup", () => {
    for (const role of [Role.ADMIN, Role.SUPER_ADMIN]) {
      expect(() =>
        assertOrderTransition(
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.ASSIGNED_TO_COURIER,
          role,
        ),
      ).toThrow("cannot move an order");
      expect(() =>
        assertOrderTransition(
          OrderStatus.DELIVERED,
          OrderStatus.OUT_FOR_DELIVERY,
          role,
        ),
      ).toThrow("cannot move an order");
    }
  });

  it("allows customers to cancel their own active order only within 15 minutes", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const creationTimes = [
      new Date(now.getTime() - CUSTOMER_CANCELLATION_WINDOW_MS),
      new Date(now.getTime() - CUSTOMER_CANCELLATION_WINDOW_MS - 1),
    ];
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        for (const isOwner of [false, true]) {
          for (const createdAt of creationTimes) {
            const isWithinCustomerWindow =
              createdAt.getTime() >=
              now.getTime() - CUSTOMER_CANCELLATION_WINDOW_MS;
            const isActive = [
              OrderStatus.COOKING,
              OrderStatus.READY,
              OrderStatus.ASSIGNED_TO_COURIER,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DELIVERED,
            ].includes(status);
            const expectedCancellation =
              isActive &&
              ((role === Role.CUSTOMER &&
                isOwner &&
                isWithinCustomerWindow) ||
                role === Role.ADMIN ||
                role === Role.SUPER_ADMIN);
            expect(
              canCancelOrder(status, role, isOwner, createdAt, now),
              `${role} from ${status}, owner=${String(isOwner)}, createdAt=${createdAt.toISOString()}`,
            ).toBe(expectedCancellation);
          }
        }
      }
    }
  });

  it("allows only administrators to edit before courier pickup", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        expect(canAdministratorEditOrder(status, role)).toBe(
          (role === Role.ADMIN || role === Role.SUPER_ADMIN) &&
            [
              OrderStatus.COOKING,
              OrderStatus.READY,
              OrderStatus.ASSIGNED_TO_COURIER,
            ].includes(status),
        );
      }
    }
  });

  it("allows administrator completion only for active unsettled statuses", () => {
    for (const status of Object.values(OrderStatus)) {
      for (const role of Object.values(Role)) {
        expect(canAdministratorCompleteOrder(status, role)).toBe(
          [Role.ADMIN, Role.SUPER_ADMIN].includes(role) &&
            [
              OrderStatus.COOKING,
              OrderStatus.READY,
              OrderStatus.ASSIGNED_TO_COURIER,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DELIVERED,
            ].includes(status),
        );
      }
    }
  });

  it("allows only dispatch roles to correct an assignment before delivery", () => {
    for (const role of Object.values(Role)) {
      expect(canManageCourierAssignment(role), role).toBe(
        [Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN].includes(role),
      );
    }
    for (const status of Object.values(OrderStatus)) {
      expect(canEditCourierAssignment(status), status).toBe(
        [OrderStatus.READY, OrderStatus.ASSIGNED_TO_COURIER].includes(status),
      );
    }
  });
});
