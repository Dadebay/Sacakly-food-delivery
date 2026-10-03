import type { components } from "@alowalow/api-contract";

type SessionUser = components["schemas"]["AuthSessionUserDto"];
export type AdminPortalRole = SessionUser["role"];

const ADMIN_PORTAL_ROLES = new Set<AdminPortalRole>([
  "OPERATOR",
  "COOK",
  "ACCOUNTANT",
  "COURIER",
  "ADMIN",
  "SUPER_ADMIN",
]);

const WEB_SESSION_ROLES = new Set<AdminPortalRole>([
  ...ADMIN_PORTAL_ROLES,
]);

export function canAccessAdminPortal(role: AdminPortalRole) {
  return ADMIN_PORTAL_ROLES.has(role);
}

export function canAccessWebSession(role: AdminPortalRole) {
  return WEB_SESSION_ROLES.has(role);
}
