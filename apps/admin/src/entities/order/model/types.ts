import type { components } from "@sacakly/api-contract";

export type Order = components["schemas"]["OrderResponseDto"];
export type OrderList = components["schemas"]["OrderListResponseDto"];
export type OrderStatus = Order["status"];
export type Role = components["schemas"]["Role"];
export type Courier = components["schemas"]["CourierSummaryResponseDto"];

export const orderStatuses: OrderStatus[] = [
  "COOKING",
  "READY",
  "ASSIGNED_TO_COURIER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CASH_RETURNED",
  "RECONCILED",
  "CANCELLED",
];

export const statusLabels: Record<OrderStatus, string> = {
  COOKING: "Готовится",
  READY: "Собран",
  ASSIGNED_TO_COURIER: "Назначен курьеру",
  OUT_FOR_DELIVERY: "Доставляется",
  DELIVERED: "Доставлен",
  CASH_RETURNED: "Завершён · наличные сданы",
  RECONCILED: "Сверен бухгалтером",
  CANCELLED: "Отменён",
};

export const roleLabels: Record<Role, string> = {
  CUSTOMER: "Клиент",
  OPERATOR: "Оператор",
  COOK: "Повар",
  COURIER: "Курьер",
  ACCOUNTANT: "Бухгалтер",
  ADMIN: "Администратор",
  SUPER_ADMIN: "Главный администратор",
};

const nextByRole: Partial<
  Record<Role, Partial<Record<OrderStatus, OrderStatus>>>
> = {
  COURIER: {
    ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
    DELIVERED: "CASH_RETURNED",
  },
};

const adminNext: Partial<Record<OrderStatus, OrderStatus>> = {
  ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: "CASH_RETURNED",
};

export function nextOrderStatus(role: Role, status: OrderStatus) {
  if (role === "SUPER_ADMIN" && status === "CASH_RETURNED") {
    return "RECONCILED";
  }
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? adminNext[status]
    : nextByRole[role]?.[status];
}

const courierTransitionActionLabels: Partial<Record<OrderStatus, string>> = {
  OUT_FOR_DELIVERY: "Забрал заказ",
  DELIVERED: "Доставил заказ",
  CASH_RETURNED: "Сдал наличные",
};

export function orderTransitionActionLabel(
  role: Role,
  nextStatus: OrderStatus,
) {
  return role === "COURIER"
    ? (courierTransitionActionLabels[nextStatus] ?? statusLabels[nextStatus])
    : statusLabels[nextStatus];
}

export function canCancel(role: Role, status: OrderStatus) {
  return (
    ["ADMIN", "SUPER_ADMIN"].includes(role) &&
    [
      "COOKING",
      "READY",
      "ASSIGNED_TO_COURIER",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ].includes(status)
  );
}

export function canAdministratorCompleteOrder(role: Role, status: OrderStatus) {
  return canCancel(role, status);
}

const previousByStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  READY: "COOKING",
  ASSIGNED_TO_COURIER: "READY",
};

export function previousOrderStatus(role: Role, status: OrderStatus) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? previousByStatus[status]
    : undefined;
}

export function canAdministratorEditOrder(role: Role, status: OrderStatus) {
  return (
    ["ADMIN", "SUPER_ADMIN"].includes(role) &&
    ["COOKING", "READY", "ASSIGNED_TO_COURIER"].includes(status)
  );
}

export function canEditCourierAssignment(role: Role, status: OrderStatus) {
  return (
    ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) &&
    status === "ASSIGNED_TO_COURIER"
  );
}

export function ratingStars(score: number) {
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
}

export function orderItemLabel(
  item: Pick<Order["items"][number], "productName" | "variantName">,
) {
  return item.variantName
    ? `${item.productName} · ${item.variantName}`
    : item.productName;
}

export function orderPaymentBreakdown(
  order: Pick<Order, "subtotal" | "discount" | "deliveryFee" | "total">,
) {
  return {
    food:
      Math.round((Number(order.subtotal) - Number(order.discount)) * 100) / 100,
    delivery: Number(order.deliveryFee),
    total: Number(order.total),
  };
}
