import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchRoutes } from "react-router";
import {
  adminNavigation,
  defaultAdminPathForRole,
} from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

const expectedPaths = {
  "login-attempts": "/login-attempts",
  orders: "/orders",
  accounting: "/accounting",
  "meal-config": "/meal-config",
  map: "/couriers/map",
  branches: "/branches",
  delivery: "/delivery",
  catalog: "/catalog",
  marketing: "/marketing",
  notifications: "/notifications",
  staff: "/staff",
  contacts: "/contacts",
  "app-versions": "/settings/app-versions",
  access: "/access",
};

const routeTree = [
  {
    children: adminNavigation.map(({ id, path }) => ({
      id,
      path,
    })),
  },
];

test("every admin section owns a unique canonical browser URL", () => {
  assert.deepEqual(
    Object.fromEntries(adminNavigation.map(({ id, path }) => [id, path])),
    expectedPaths,
  );
  assert.equal(
    new Set(adminNavigation.map(({ path }) => path)).size,
    adminNavigation.length,
  );
  assert.equal(adminNavigation.some(({ path }) => path === "/cash"), false);

  for (const { id, path } of adminNavigation) {
    const matches = matchRoutes(routeTree, path);
    assert.equal(matches?.at(-1)?.route.id, id, path);
  }
});

test("each portal role returns to its authorized home", () => {
  assert.equal(defaultAdminPathForRole("ACCOUNTANT"), "/accounting");
  assert.equal(defaultAdminPathForRole("ADMIN"), "/orders");
  assert.equal(defaultAdminPathForRole("SUPER_ADMIN"), "/orders");
  assert.equal(defaultAdminPathForRole("ADMIN", ["CATALOG"]), "/catalog");
  assert.equal(defaultAdminPathForRole("ADMIN", []), "/access-denied");
});

test("the SPA uses history routing, role guards and a nested admin layout", async () => {
  const [appSource, dashboardSource, nginxSource] = await Promise.all([
    readFile(new URL("../src/app/ui/app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../nginx.conf", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /<BrowserRouter>/);
  assert.match(appSource, /<Routes>/);
  assert.match(appSource, /adminNavigation\.map/);
  assert.match(appSource, /navigationForRole\(/);
  assert.match(appSource, /pageAccess\.data\.allowedPages/);
  assert.match(appSource, /function RootRedirect/);
  assert.match(appSource, /path="\/courier"/);
  assert.match(
    appSource,
    /defaultAdminPathForRole\(\s*session\.user\.role,/,
  );
  assert.match(appSource, /<Route path="\*" element=\{<NotFound \/>\}/);
  assert.match(dashboardSource, /<NavLink/);
  assert.match(dashboardSource, /<Outlet \/>/);
  assert.match(nginxSource, /try_files \$uri \$uri\/ \/index\.html;/);
});
