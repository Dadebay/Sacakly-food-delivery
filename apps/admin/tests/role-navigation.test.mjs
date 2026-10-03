import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAccessAdminPortal,
  canAccessWebSession,
} from "../src/shared/auth/model/admin-portal-access.ts";
import {
  adminNavigation,
  navigationForRole,
} from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

function views(role) {
  return navigationForRole(role).map((item) => item.id);
}

const administratorViews = [
  "login-attempts",
  "orders",
  "meal-config",
  "accounting",
  "map",
  "branches",
  "delivery",
  "catalog",
  "marketing",
  "notifications",
  "staff",
  "contacts",
  "app-versions",
];

test("every staff role may enter its page-controlled portal", () => {
  for (const role of [
    "OPERATOR",
    "COOK",
    "COURIER",
    "ACCOUNTANT",
    "ADMIN",
    "SUPER_ADMIN",
  ]) {
    assert.equal(canAccessAdminPortal(role), true, role);
  }
  for (const role of ["CUSTOMER"]) {
    assert.equal(canAccessAdminPortal(role), false, role);
    assert.deepEqual(views(role), [], role);
  }
});

test("couriers may use both their dedicated workspace and granted admin pages", () => {
  for (const role of [
    "OPERATOR",
    "COOK",
    "COURIER",
    "ACCOUNTANT",
    "ADMIN",
    "SUPER_ADMIN",
  ]) {
    assert.equal(canAccessWebSession(role), true, role);
  }
  for (const role of ["CUSTOMER"]) {
    assert.equal(canAccessWebSession(role), false, role);
  }
  assert.equal(canAccessAdminPortal("COURIER"), true);
  assert.deepEqual(
    navigationForRole("COURIER", ["ORDERS", "STAFF"]).map(({ id }) => id),
    ["orders", "staff"],
  );
});

test("accountant navigation contains only shift accounting", () => {
  assert.deepEqual(views("ACCOUNTANT"), ["accounting"]);
});

test("operator and cook navigation matches their supported workspaces", () => {
  assert.deepEqual(views("OPERATOR"), ["orders", "map"]);
  assert.deepEqual(views("COOK"), ["orders"]);
});

test("administrators retain all management sections represented outside the full-flow board", () => {
  assert.deepEqual(views("ADMIN"), administratorViews);
  assert.deepEqual(views("SUPER_ADMIN"), [...administratorViews, "access"]);
});

test("server-provided page access controls and expands role navigation", () => {
  assert.deepEqual(
    navigationForRole("ADMIN", ["ORDERS", "CATALOG"]).map(({ id }) => id),
    ["orders", "catalog"],
  );
  assert.deepEqual(
    navigationForRole("ACCOUNTANT", ["ORDERS", "ACCOUNTING"]).map(
      ({ id }) => id,
    ),
    ["orders", "accounting"],
  );
  assert.deepEqual(
    navigationForRole("OPERATOR", ["ORDERS"]).map(({ id }) => id),
    ["orders"],
  );
  assert.deepEqual(
    navigationForRole("COOK", []).map(({ id }) => id),
    [],
  );
  assert.deepEqual(
    navigationForRole("SUPER_ADMIN", []).map(({ id }) => id),
    [...administratorViews, "access"],
  );
});

test("dashboard renders navigation from the tested role matrix", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /navigationForRole\(\s*session\.user\.role,/);
  assert.match(source, /pageAccess\.data\.allowedPages/);
  assert.match(source, /canOpenOrders/);
  assert.match(source, /canOpenInventory/);
  assert.match(source, /visibleNav\.map/);
  assert.match(source, /<NavLink/);
  assert.match(source, /to=\{item\.path\}/);
  assert.match(source, /<Outlet \/>/);
  assert.doesNotMatch(source, /setView\(/);
  assert.match(source, /!canAccessAdminPortal\(session\.user\.role\)/);
});

test("the courier screen is isolated from admin navigation and accepts courier sessions", async () => {
  const [appSource, sessionSource, dashboardSource] = await Promise.all([
    readFile(new URL("../src/app/ui/app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/shared/auth/model/session-provider.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.equal(
    adminNavigation.some(({ path }) => path === "/courier"),
    false,
  );
  assert.match(appSource, /path="\/courier"/);
  assert.match(appSource, /CourierTrackingScreen/);
  assert.match(appSource, /COURIER_WORKSPACE/);
  assert.match(appSource, /path="\/access-denied"/);
  assert.match(appSource, /defaultAdminPathForRole\(\s*session\.user\.role,/);
  assert.match(sessionSource, /!canAccessWebSession\(response\.user\.role\)/);
  assert.match(sessionSource, /Веб-доступ разрешён/);
  assert.match(dashboardSource, /!canAccessAdminPortal\(session\.user\.role\)/);
  assert.match(dashboardSource, /data-testid="admin-open-courier-screen"/);
});
