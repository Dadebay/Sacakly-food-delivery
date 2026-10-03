import { ForbiddenException } from "@nestjs/common";
import { OrderStatus, Role } from "../generated/prisma/client";

const transitions: Partial<
  Record<OrderStatus, Partial<Record<Role, OrderStatus[]>>>
> = {
  [OrderStatus.READY]: {
    [Role.ADMIN]: [OrderStatus.COOKING],
    [Role.SUPER_ADMIN]: [OrderStatus.COOKING],
  },
  [OrderStatus.ASSIGNED_TO_COURIER]: {
    [Role.COURIER]: [OrderStatus.OUT_FOR_DELIVERY],
    [Role.ADMIN]: [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
    [Role.SUPER_ADMIN]: [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
  },
  [OrderStatus.OUT_FOR_DELIVERY]: {
    [Role.COURIER]: [OrderStatus.DELIVERED],
    [Role.ADMIN]: [OrderStatus.DELIVERED],
    [Role.SUPER_ADMIN]: [OrderStatus.DELIVERED],
  },
  [OrderStatus.DELIVERED]: {
    [Role.COURIER]: [OrderStatus.CASH_RETURNED],
    [Role.ADMIN]: [OrderStatus.CASH_RETURNED],
    [Role.SUPER_ADMIN]: [OrderStatus.CASH_RETURNED],
  },
  [OrderStatus.CASH_RETURNED]: {
    [Role.SUPER_ADMIN]: [OrderStatus.RECONCILED],
  },
};

export function allowedOrderTransitions(
  status: OrderStatus,
  role: Role,
): OrderStatus[] {
  return transitions[status]?.[role] ?? [];
}

export function assertOrderTransition(
  status: OrderStatus,
  target: OrderStatus,
  role: Role,
) {
  if (!allowedOrderTransitions(status, role).includes(target)) {
    throw new ForbiddenException(
      `Role ${role} cannot move an order from ${status} to ${target}`,
    );
  }
}

export const CUSTOMER_CANCELLATION_WINDOW_MS = 15 * 60 * 1000;

const cancellableStatuses: OrderStatus[] = [
  OrderStatus.COOKING,
  OrderStatus.READY,
  OrderStatus.ASSIGNED_TO_COURIER,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

export function canCancelOrder(
  status: OrderStatus,
  role: Role,
  isOwner: boolean,
  createdAt: Date,
  now: Date,
) {
  if (!cancellableStatuses.includes(status)) return false;
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) return true;
  if (role !== Role.CUSTOMER || !isOwner) return false;
  return (
    createdAt.getTime() >= now.getTime() - CUSTOMER_CANCELLATION_WINDOW_MS
  );
}

const administratorEditableStatuses: OrderStatus[] = [
  OrderStatus.COOKING,
  OrderStatus.READY,
  OrderStatus.ASSIGNED_TO_COURIER,
];

export function canAdministratorEditOrder(status: OrderStatus, role: Role) {
  return (
    (role === Role.ADMIN || role === Role.SUPER_ADMIN) &&
    administratorEditableStatuses.includes(status)
  );
}

/** Audited recovery when the real courier could not use the application. */
export function canAdministratorCompleteOrder(status: OrderStatus, role: Role) {
  return (
    (role === Role.ADMIN || role === Role.SUPER_ADMIN) &&
    cancellableStatuses.includes(status)
  );
}

const courierAssignmentRoles: Role[] = [
  Role.OPERATOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

const courierAssignmentStatuses: OrderStatus[] = [
  OrderStatus.READY,
  OrderStatus.ASSIGNED_TO_COURIER,
];

export function canManageCourierAssignment(role: Role) {
  return courierAssignmentRoles.includes(role);
}

export function canEditCourierAssignment(status: OrderStatus) {
  return courierAssignmentStatuses.includes(status);
}

/** Ingredient reservations remain refundable until the courier physically
 * picks up the order. Assignment alone is not pickup. */
export function returnsInventoryOnCancellation(status: OrderStatus): boolean {
  return (
    status === OrderStatus.COOKING ||
    status === OrderStatus.READY ||
    status === OrderStatus.ASSIGNED_TO_COURIER
  );
}
