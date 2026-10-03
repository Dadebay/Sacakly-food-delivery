import { describe, expect, it } from "vitest";
import { AdminPage, Role } from "../src/generated/prisma/client";
import {
  ADMIN_PAGES,
  OPERATIONS_ADMIN_PAGES,
  availableAdminPages,
  defaultAdminPages,
  effectiveAdminPages,
  expandedAdminPages,
  isConfigurableAdminPageRole,
} from "../src/users/admin-page-access.policy";

describe("admin page access policy", () => {
  it("keeps the super administrator immutable with every page", () => {
    expect(effectiveAdminPages(Role.SUPER_ADMIN, [])).toEqual(ADMIN_PAGES);
    expect(isConfigurableAdminPageRole(Role.SUPER_ADMIN)).toBe(false);
  });

  it("defaults every staff web role to its safe working pages", () => {
    expect(defaultAdminPages(Role.ADMIN)).toEqual(OPERATIONS_ADMIN_PAGES);
    expect(defaultAdminPages(Role.OPERATOR)).toEqual([
      AdminPage.ORDERS,
      AdminPage.COURIER_MAP,
    ]);
    expect(defaultAdminPages(Role.COOK)).toEqual([AdminPage.ORDERS]);
    expect(defaultAdminPages(Role.COURIER)).toEqual([
      AdminPage.COURIER_WORKSPACE,
    ]);
    expect(defaultAdminPages(Role.ACCOUNTANT)).toEqual([AdminPage.ACCOUNTING]);
    expect(defaultAdminPages(Role.CUSTOMER)).toEqual([]);
  });

  it("allows a role policy to grant any admin page across roles", () => {
    expect(
      effectiveAdminPages(Role.ADMIN, [AdminPage.ORDERS, AdminPage.CATALOG]),
    ).toEqual([AdminPage.ORDERS, AdminPage.CATALOG]);
    expect(
      effectiveAdminPages(Role.ACCOUNTANT, [
        AdminPage.ACCOUNTING,
        AdminPage.ORDERS,
      ]),
    ).toEqual([AdminPage.ORDERS, AdminPage.ACCOUNTING]);
    expect(availableAdminPages(Role.ACCOUNTANT)).toEqual(ADMIN_PAGES);
    expect(
      effectiveAdminPages(Role.COURIER, [
        AdminPage.COURIER_WORKSPACE,
        AdminPage.ORDERS,
      ]),
    ).toEqual([AdminPage.ORDERS, AdminPage.COURIER_WORKSPACE]);
    expect(ADMIN_PAGES).toContain(AdminPage.COURIER_WORKSPACE);
    expect(
      expandedAdminPages(Role.COURIER, [
        AdminPage.COURIER_WORKSPACE,
        AdminPage.STAFF,
      ]),
    ).toEqual([AdminPage.STAFF]);
    expect(expandedAdminPages(Role.COOK, [AdminPage.ORDERS])).toEqual([]);
  });
});
