import type { OrderStatus, Role } from "./types";

export type OrderKanbanLaneId = "kitchen" | "courier" | "archive";

export type OrderKanbanLane = {
  id: OrderKanbanLaneId;
  title: string;
  responsibility: string;
  statuses: OrderStatus[];
  collapsed?: boolean;
};

export type OrderCardField =
  "customer" | "delivery" | "branch" | "items" | "cash" | "courier";

export const orderKanbanLanes: OrderKanbanLane[] = [
  {
    id: "kitchen",
    title: "Кухня",
    responsibility: "Готовится → готов к сборке",
    statuses: ["COOKING", "READY"],
  },
  {
    id: "courier",
    title: "Курьер",
    responsibility: "Курьер → оператор",
    statuses: ["ASSIGNED_TO_COURIER", "OUT_FOR_DELIVERY", "DELIVERED"],
  },
  {
    id: "archive",
    title: "Завершённые и отменённые",
    responsibility: "История за выбранный период",
    statuses: ["CASH_RETURNED", "RECONCILED", "CANCELLED"],
    collapsed: true,
  },
];

const fullFlowRoles = new Set<Role>([
  "OPERATOR",
  "ACCOUNTANT",
  "ADMIN",
  "SUPER_ADMIN",
]);

const laneIdsByRole: Partial<Record<Role, Set<OrderKanbanLaneId>>> = {
  COOK: new Set(["kitchen"]),
  COURIER: new Set(["courier"]),
};

const queueStatusesByRole: Partial<Record<Role, OrderStatus[]>> = {
  COOK: ["COOKING", "READY"],
  COURIER: ["ASSIGNED_TO_COURIER", "OUT_FOR_DELIVERY", "DELIVERED"],
};

const cardFieldsByRole: Record<Role, Set<OrderCardField>> = {
  CUSTOMER: new Set(),
  OPERATOR: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
    "courier",
  ]),
  COOK: new Set(["branch", "items"]),
  COURIER: new Set(["customer", "delivery", "branch", "items", "cash"]),
  ACCOUNTANT: new Set(["branch", "cash", "courier"]),
  ADMIN: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
    "courier",
  ]),
  SUPER_ADMIN: new Set([
    "customer",
    "delivery",
    "branch",
    "items",
    "cash",
    "courier",
  ]),
};

export function kanbanLanesForRole(role: Role) {
  if (fullFlowRoles.has(role)) return orderKanbanLanes;
  const laneIds = laneIdsByRole[role];
  return laneIds ? orderKanbanLanes.filter((lane) => laneIds.has(lane.id)) : [];
}

export function orderCardFieldsForRole(role: Role) {
  return cardFieldsByRole[role];
}

export function kanbanQueueStatusesForRole(role: Role) {
  return queueStatusesByRole[role];
}

export function roleCanUseOrderTable(role: Role) {
  return ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role);
}
