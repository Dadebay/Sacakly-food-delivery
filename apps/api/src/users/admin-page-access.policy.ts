import { AdminPage, Role } from "../generated/prisma/client";

export const ADMIN_PAGES = Object.values(AdminPage);

export const OPERATIONS_ADMIN_PAGES = ADMIN_PAGES.filter(
  (page) => page !== AdminPage.COURIER_WORKSPACE,
);

const DEFAULT_PAGES_BY_ROLE: Partial<Record<Role, readonly AdminPage[]>> = {
  [Role.ACCOUNTANT]: [AdminPage.ACCOUNTING],
  [Role.ADMIN]: OPERATIONS_ADMIN_PAGES,
  [Role.OPERATOR]: [AdminPage.ORDERS, AdminPage.COURIER_MAP],
  [Role.COOK]: [AdminPage.ORDERS],
  [Role.COURIER]: [AdminPage.COURIER_WORKSPACE],
  [Role.SUPER_ADMIN]: ADMIN_PAGES,
};

export const CONFIGURABLE_ADMIN_PAGE_ROLES = [
  Role.ADMIN,
  Role.OPERATOR,
  Role.COOK,
  Role.COURIER,
  Role.ACCOUNTANT,
] as const;

export const ADMIN_PAGE_ACCESS_MATRIX_ROLES = [
  Role.SUPER_ADMIN,
  ...CONFIGURABLE_ADMIN_PAGE_ROLES,
] as const;

export function defaultAdminPages(role: Role): AdminPage[] {
  return [...(DEFAULT_PAGES_BY_ROLE[role] ?? [])];
}

export function availableAdminPages(role: Role): AdminPage[] {
  return role === Role.CUSTOMER ? [] : [...ADMIN_PAGES];
}

export function isConfigurableAdminPageRole(
  role: Role,
): role is (typeof CONFIGURABLE_ADMIN_PAGE_ROLES)[number] {
  return CONFIGURABLE_ADMIN_PAGE_ROLES.includes(
    role as (typeof CONFIGURABLE_ADMIN_PAGE_ROLES)[number],
  );
}

export function effectiveAdminPages(
  role: Role,
  storedPages: readonly AdminPage[] | null,
): AdminPage[] {
  if (role === Role.SUPER_ADMIN) return defaultAdminPages(role);
  if (!isConfigurableAdminPageRole(role)) return [];
  if (storedPages === null) return defaultAdminPages(role);

  return ADMIN_PAGES.filter((page) => storedPages.includes(page));
}

export function expandedAdminPages(
  role: Role,
  storedPages: readonly AdminPage[] | null,
): AdminPage[] {
  if (storedPages === null || !isConfigurableAdminPageRole(role)) return [];
  const defaults = new Set(defaultAdminPages(role));
  return effectiveAdminPages(role, storedPages).filter(
    (page) => !defaults.has(page),
  );
}
