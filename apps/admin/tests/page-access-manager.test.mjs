import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adminPageValues } from "../src/entities/admin-page-access/model/types.ts";

test("page access registry covers every configurable backend page exactly once", () => {
  assert.equal(adminPageValues.length, 14);
  assert.equal(new Set(adminPageValues).size, adminPageValues.length);
  assert.deepEqual(adminPageValues, [
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
  ]);
});

test("super-admin access screen uses the real API, versioned updates and accessible controls", async () => {
  const [querySource, actionSource, managerSource] = await Promise.all([
    readFile(
      new URL(
        "../src/entities/admin-page-access/api/admin-page-access-queries.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/admin-page-access/api/use-admin-page-access-actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/page-access-manager/ui/page-access-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(querySource, /"\/admin-page-access\/me"/);
  assert.match(querySource, /"\/admin-page-access"/);
  assert.match(actionSource, /method: "PUT"/);
  assert.match(actionSource, /invalidateQueries/);
  assert.match(managerSource, /useForm</);
  assert.match(managerSource, /register\("allowedPages"\)/);
  assert.match(managerSource, /register\("version"/);
  assert.match(managerSource, /type="checkbox"/);
  assert.match(
    managerSource,
    /page-access-save-\$\{access\.role\.toLowerCase\(\)/,
  );
  assert.match(managerSource, /Доступ по ролям/);
  assert.match(managerSource, /все 14 страниц/);
  assert.match(managerSource, /всем сотрудникам выбранной роли/);
  assert.match(managerSource, /matrix\.data\?\.roles/);
  assert.doesNotMatch(managerSource, /page-access-search/);
  assert.doesNotMatch(managerSource, /page-access-role-filter/);
  assert.doesNotMatch(managerSource, /access\.userId/);
  assert.doesNotMatch(managerSource, /Не поддерживается ролью/);
});
