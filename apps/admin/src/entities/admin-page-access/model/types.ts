import type { components } from "@alowalow/api-contract";

export type AdminRolePageAccess =
  components["schemas"]["AdminRolePageAccessResponseDto"];
export type AdminPageAccessMatrix =
  components["schemas"]["AdminPageAccessMatrixResponseDto"];
export type UpdateAdminPageAccess =
  components["schemas"]["UpdateAdminPageAccessDto"];
export type AdminPage = AdminRolePageAccess["allowedPages"][number];

export const adminPageValues = [
  "LOGIN_ATTEMPTS",
  "ORDERS",
  "MEAL_CONFIG",
  "ACCOUNTING",
  "COURIER_MAP",
  "COURIER_WORKSPACE",
  "BRANCHES",
  "DELIVERY",
  "CATALOG",
  "MARKETING",
  "NOTIFICATIONS",
  "STAFF",
  "CONTACTS",
  "APP_VERSIONS",
] as const satisfies readonly AdminPage[];

export const adminPageLabels: Record<AdminPage, string> = {
  LOGIN_ATTEMPTS: "Попытки входа",
  ORDERS: "Заказы",
  MEAL_CONFIG: "Склад и рецептуры",
  ACCOUNTING: "Смены и касса",
  COURIER_MAP: "Карта курьеров",
  COURIER_WORKSPACE: "Рабочее место курьера",
  BRANCHES: "Филиалы",
  DELIVERY: "Тарифы доставки",
  CATALOG: "Каталог кафе",
  MARKETING: "Маркетинг",
  NOTIFICATIONS: "Уведомления",
  STAFF: "Команда",
  CONTACTS: "Контакты",
  APP_VERSIONS: "Настройки приложения",
};
