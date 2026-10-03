import type { Role } from "@/src/entities/order";
import type { AdminPage } from "@/src/entities/admin-page-access";

export type AdminView =
  | "orders"
  | "map"
  | "meal-config"
  | "branches"
  | "delivery"
  | "catalog"
  | "marketing"
  | "notifications"
  | "staff"
  | "contacts"
  | "app-versions"
  | "login-attempts"
  | "accounting"
  | "access";

export type AdminNavIconName = AdminView;

export type AdminNavigationItem = {
  id: AdminView;
  label: string;
  icon: AdminNavIconName;
  path: `/${string}`;
  roles: Role[];
  page: AdminPage | null;
};

export const adminNavigation: AdminNavigationItem[] = [
  {
    id: "login-attempts",
    label: "Попытки входа",
    icon: "login-attempts",
    path: "/login-attempts",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "LOGIN_ATTEMPTS",
  },
  {
    id: "orders",
    label: "Заказы",
    icon: "orders",
    path: "/orders",
    roles: ["OPERATOR", "COOK", "ADMIN", "SUPER_ADMIN"],
    page: "ORDERS",
  },
  {
    id: "meal-config",
    label: "Склад и рецептуры",
    icon: "meal-config",
    path: "/meal-config",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "MEAL_CONFIG",
  },
  {
    id: "accounting",
    label: "Смены и касса",
    icon: "accounting",
    path: "/accounting",
    roles: ["ACCOUNTANT", "ADMIN", "SUPER_ADMIN"],
    page: "ACCOUNTING",
  },
  {
    id: "map",
    label: "Карта курьеров",
    icon: "map",
    path: "/couriers/map",
    roles: ["OPERATOR", "ADMIN", "SUPER_ADMIN"],
    page: "COURIER_MAP",
  },
  {
    id: "branches",
    label: "Филиалы",
    icon: "branches",
    path: "/branches",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "BRANCHES",
  },
  {
    id: "delivery",
    label: "Тарифы доставки",
    icon: "delivery",
    path: "/delivery",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "DELIVERY",
  },
  {
    id: "catalog",
    label: "Каталог кафе",
    icon: "catalog",
    path: "/catalog",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "CATALOG",
  },
  {
    id: "marketing",
    label: "Маркетинг",
    icon: "marketing",
    path: "/marketing",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "MARKETING",
  },
  {
    id: "notifications",
    label: "Уведомления",
    icon: "notifications",
    path: "/notifications",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "NOTIFICATIONS",
  },
  {
    id: "staff",
    label: "Команда",
    icon: "staff",
    path: "/staff",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "STAFF",
  },
  {
    id: "contacts",
    label: "Контакты",
    icon: "contacts",
    path: "/contacts",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "CONTACTS",
  },
  {
    id: "app-versions",
    label: "Настройки",
    icon: "app-versions",
    path: "/settings/app-versions",
    roles: ["ADMIN", "SUPER_ADMIN"],
    page: "APP_VERSIONS",
  },
  {
    id: "access",
    label: "Доступы",
    icon: "access",
    path: "/access",
    roles: ["SUPER_ADMIN"],
    page: null,
  },
];

export function navigationForRole(role: Role, allowedPages?: AdminPage[]) {
  return adminNavigation.filter((item) => {
    if (item.page === null) return item.roles.includes(role);
    if (role === "SUPER_ADMIN") return true;
    if (allowedPages === undefined) return item.roles.includes(role);
    return allowedPages.includes(item.page);
  });
}

export function defaultAdminPathForRole(
  role: Role,
  allowedPages?: AdminPage[],
) {
  const navigation = navigationForRole(role, allowedPages);
  return (
    navigation.find(({ id }) => id === "accounting" && role === "ACCOUNTANT")
      ?.path ??
    navigation.find(({ id }) => id === "orders")?.path ??
    navigation[0]?.path ??
    (allowedPages ? "/access-denied" : "/")
  );
}
