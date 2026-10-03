import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL(
  "../src/widgets/accounting-dashboard/ui/accounting-dashboard.tsx",
  import.meta.url,
);
const queryUrl = new URL(
  "../src/entities/accounting/api/accounting-queries.ts",
  import.meta.url,
);
const actionUrl = new URL(
  "../src/features/accounting-management/api/use-accounting-actions.ts",
  import.meta.url,
);
const stylesUrl = new URL("../src/app/styles/globals.css", import.meta.url);

test("shift accounting uses the real API with role-scoped report loading", async () => {
  const [queries, actions] = await Promise.all([
    readFile(queryUrl, "utf8"),
    readFile(actionUrl, "utf8"),
  ]);
  for (const path of [
    "/accounting/settings",
    "/accounting/shifts?",
    "/accounting/report?",
  ]) {
    assert.ok(queries.includes(path), path);
  }
  assert.match(queries, /\["ACCOUNTANT", "SUPER_ADMIN"\]/);
  assert.match(actions, /"\/accounting\/handoffs"/);
  assert.match(actions, /`\/accounting\/handoffs\/\$\{id\}\/confirm`/);
  assert.match(actions, /invalidateQueries\(\{ queryKey: accountingQueryKeys\.all \}\)/);
});

test("the screen exposes distinct admin, accountant and super-admin duties", async () => {
  const source = (await readFile(dashboardUrl, "utf8")) + (await readFile(new URL("../src/widgets/accounting-dashboard/ui/accounting-cash.tsx", import.meta.url), "utf8"));
  assert.match(source, /role === "ADMIN" \|\| role === "SUPER_ADMIN"/);
  assert.match(source, /role === "ACCOUNTANT" \|\| role === "SUPER_ADMIN"/);
  assert.match(source, /role === "SUPER_ADMIN"/);
  assert.match(source, /data-testid="accounting-handoff-form"/);
  assert.match(source, /data-testid=\{`accounting-confirm-/);
  assert.match(source, /data-testid="accounting-settings-form"/);
  assert.match(source, /data-testid="accounting-products"/);
  assert.match(source, /zodResolver\(accountingRangeSchema\)/);
  assert.match(source, /zodResolver\(accountingSettingsSchema\)/);
  assert.match(source, /zodResolver\(cashHandoffSchema\)/);
  assert.match(source, /Бухгалтерия/);
  assert.match(source, /Доставка исключена/);
  assert.match(source, /Еда по системе/);
});

test("shift accounting collapses to one column on phones", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /\.accounting-metrics\s*\{[^}]*grid-template-columns: repeat\(3,/s);
  assert.match(styles, /\.accounting-shift-grid\s*\{[^}]*grid-template-columns: repeat\(2,/s);
  assert.match(
    styles,
    /@media \(max-width: 700px\)[\s\S]*?\.accounting-range,[\s\S]*?\.accounting-shift-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
});
