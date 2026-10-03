import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../src/app/styles/globals.css", import.meta.url);

const actionHeaders = [
  ["catalog", "../src/widgets/catalog-manager/ui/catalog-manager.tsx"],
  ["orders", "../src/widgets/order-board/ui/order-board.tsx"],
  ["staff", "../src/widgets/staff-manager/ui/staff-manager.tsx"],
  ["branch", "../src/widgets/branch-manager/ui/branch-manager.tsx"],
];

test("top-level admin actions share one bordered header surface", async () => {
  for (const [name, relativePath] of actionHeaders) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");

    assert.match(source, new RegExp(`data-testid="${name}-header"`));
    assert.match(source, /className="[^"]*section-header-actions[^"]*"/);
  }

  const styles = await readFile(stylesUrl, "utf8");
  assert.match(
    styles,
    /\.header-actions\.section-header-actions\s*\{[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 14px;/s,
  );
});

test("marketing keeps its focused workspace alongside global order alerts", async () => {
  const [marketing, dashboard, styles] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(marketing, /className="admin-section marketing-section"/);
  assert.doesNotMatch(marketing, />МАРКЕТИНГ</);
  assert.doesNotMatch(marketing, /Баннеры и промокоды/);
  assert.match(marketing, /className="split-tables marketing-workspace"/);
  assert.match(marketing, /className="table-card marketing-panel"/);
  assert.match(marketing, /className="marketing-panel-actions"/);
  assert.match(marketing, /data-testid="banner-form-open"/);
  assert.match(marketing, /data-testid="promo-form-open"/);
  assert.doesNotMatch(dashboard, /showOperationalBanners/);
  assert.match(dashboard, /canReceiveNewOrderAlerts\(session\.user\.role\)/);
  assert.match(
    styles,
    /\.marketing-section > \.section-head\s*\{[^}]*border-radius: 18px;/s,
  );
  assert.match(styles, /\.marketing-panel \.card-title\s*\{[^}]*min-height: 94px;/s);
});

test("marketing creation and editing stay inside accessible dialogs", async () => {
  const [marketing, styles] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(stylesUrl, "utf8"),
  ]);

  for (const testId of [
    "banner-form-backdrop",
    "banner-form-close",
    "promo-form-backdrop",
    "promo-form-close",
  ]) {
    assert.match(marketing, new RegExp(`data-testid="${testId}"`));
  }

  assert.match(marketing, /aria-labelledby="banner-form-title"/);
  assert.match(marketing, /aria-labelledby="promo-form-title"/);
  assert.match(marketing, /className="modal marketing-editor-modal"/);
  assert.match(marketing, /className="form-grid marketing-form-grid"/);
  assert.match(marketing, /className="marketing-form-actions"/);
  assert.match(marketing, /className="marketing-delete-modal"/);
  assert.match(marketing, /setShowBanner\(true\)/);
  assert.match(marketing, /setShowPromo\(true\)/);
  assert.match(
    styles,
    /\.marketing-editor-modal\s*\{[^}]*width: min\(760px, 100%\);/s,
  );
  assert.match(styles, /\.marketing-form-actions\s*\{[^}]*border-top: 1px solid var\(--line\);/s);
});

test("security journal exposes stable grouped filter controls", async () => {
  const source = await readFile(
    new URL(
      "../src/widgets/login-attempt-manager/ui/login-attempt-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  for (const testId of [
    "login-attempt-manager",
    "login-attempt-summary",
    "login-attempt-filters",
    "login-attempt-phone",
    "login-attempt-status",
    "login-attempt-platform",
    "login-attempt-from",
    "login-attempt-to",
    "login-attempt-reset",
    "login-attempt-table-card",
  ]) {
    assert.match(source, new RegExp(`data-testid="${testId}"`));
  }

  assert.match(source, /<span>Начало периода<\/span>/);
  assert.match(source, /<span>Конец периода<\/span>/);
  assert.match(source, /className="table-card login-attempt-table"/);
});

test("summary and filter layouts collapse cleanly for tablet and phone", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.login-attempt-summary\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.login-attempt-summary\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?\.login-attempt-filter-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
});
