import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableSourceUrl = new URL(
  "../src/shared/ui/data-table.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../src/app/styles/globals.css", import.meta.url);
const catalogManagerUrl = new URL(
  "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
  import.meta.url,
);

const tabletWorkspaces = [
  ["order-board/ui/order-board.tsx", "order-board"],
  ["accounting-dashboard/ui/accounting-dashboard.tsx", "accounting-dashboard"],
  ["dispatch-map/ui/dispatch-map.tsx", "dispatch-map-page"],
  ["branch-manager/ui/branch-manager.tsx", "branch-manager"],
  ["delivery-manager/ui/delivery-manager.tsx", "delivery-manager"],
  ["catalog-manager/ui/catalog-manager.tsx", "catalog-manager"],
  ["marketing-manager/ui/marketing-manager.tsx", "marketing-manager"],
  ["notification-manager/ui/notification-manager.tsx", "notification-manager"],
  ["staff-manager/ui/staff-manager.tsx", "staff-manager"],
  ["contact-manager/ui/contact-manager.tsx", "contact-manager"],
  [
    "login-attempt-manager/ui/login-attempt-manager.tsx",
    "login-attempt-manager",
  ],
];

test("shared data tables expose readable labels to responsive rows", async () => {
  const source = await readFile(tableSourceUrl, "utf8");

  assert.match(source, /data-label=\{responsiveLabel/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /--data-table-min-width/);
  assert.match(source, /variant\?: "default" \| "orders"/);
});

test("admin tables avoid nested horizontal scrolling on constrained screens", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /table-layout: auto;/);
  assert.match(styles, /container-name: admin-data-table;/);
  assert.match(styles, /@container admin-data-table \(max-width: 760px\)/);
  assert.match(
    styles,
    /@container admin-data-table \(max-width: 760px\)[\s\S]*?\.data-table--orders\s*\{/,
  );
  assert.doesNotMatch(
    styles,
    /@container admin-data-table \(max-width: 1200px\)/,
  );
  assert.match(styles, /height: max-content;/);
  assert.match(styles, /content: attr\(data-label\);/);
  assert.match(
    styles,
    /\.split-tables\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s,
  );
});

test("tablet navigation is a touch-safe drawer", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.sidebar\s*\{[^}]*overflow-y: auto;[^}]*overscroll-behavior-y: contain;[^}]*touch-action: pan-y;[^}]*-webkit-overflow-scrolling: touch;/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\),\s*\(hover: none\) and \(pointer: coarse\) and \(max-width: 1366px\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?\.integrated-shell \.sidebar\s*\{[^}]*visibility: hidden;[^}]*pointer-events: none;[^}]*transform: translateX\(-105%\);/,
  );
  assert.match(
    styles,
    /\.integrated-shell \.sidebar\.drawer-open\s*\{[^}]*visibility: visible;[^}]*pointer-events: auto;[^}]*transform: translateX\(0\);/,
  );
  assert.match(styles, /\.sidebar-close\s*\{[^}]*display: none;/s);
  assert.match(
    styles,
    /\.integrated-shell \.sidebar-head\s*\{[^}]*position: sticky;[^}]*top: 0;[\s\S]*?\.integrated-shell \.sidebar-close\s*\{[^}]*display: grid;/,
  );
  assert.match(
    styles,
    /@media \(pointer: coarse\)[\s\S]*?\.integrated-shell button,[\s\S]*?min-height: 44px;[^}]*touch-action: manipulation;/,
  );
  assert.match(
    styles,
    /\.integrated-shell input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),[\s\S]*?min-height: 44px;/,
  );
});

test("courier map keeps Leaflet layers below the admin sidebar", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.courier-map-canvas\s*\{[^}]*position: relative;[^}]*z-index: 0;[^}]*isolation: isolate;/s,
  );
  assert.match(styles, /\.sidebar\s*\{[^}]*z-index: 10;/s);
  assert.match(
    styles,
    /\.integrated-shell \.sidebar\s*\{[^}]*z-index: 70;/s,
  );
});

test("every administrator workspace exposes a stable tablet QA root", async () => {
  await Promise.all(
    tabletWorkspaces.map(async ([relativePath, testId]) => {
      const source = await readFile(
        new URL(`../src/widgets/${relativePath}`, import.meta.url),
        "utf8",
      );
      assert.match(source, new RegExp(`data-testid=["']${testId}["']`));
    }),
  );
});

test("notification composer opens as an accessible modal", async () => {
  const [source, styles] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/notification-manager/ui/notification-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /data-testid="notification-form-open"/);
  assert.match(source, /data-testid="notification-form-backdrop"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /data-testid="notification-form-close"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(styles, /\.notification-compose-modal\s*\{[^}]*width: min\(930px, 100%\);/s);
});

test("notification history groups each campaign into a readable card", async () => {
  const [source, styles] = await Promise.all([
    readFile(
      new URL(
        "../src/widgets/notification-manager/ui/notification-manager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /className="notification-history-list"/);
  assert.match(source, /className="notification-history-card"/);
  assert.match(source, /className="notification-history-metrics"/);
  assert.match(source, /data-testid=\{`notification-history-card-/);
  assert.match(styles, /\.notification-history-metrics\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(styles, /\.notification-history-card-footer\s*\{[^}]*justify-content: space-between;/s);
});

test("tablet workspaces cannot widen the page and portrait maps stack", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?\.admin-main\s*\{[^}]*max-width: 100vw;[^}]*overflow-x: clip;/,
  );
  assert.match(
    styles,
    /\.admin-section, \.table-card, \.editor-card, \.recent-logins, \.dispatch-card\s*\{[^}]*min-width: 0;[^}]*max-width: 100%;/,
  );
  assert.match(
    styles,
    /@media \(min-width: 621px\) and \(max-width: 860px\)[\s\S]*?\.dispatch-card\s*\{[^}]*display: block;[\s\S]*?height: clamp\(520px, 64vh, 720px\);/,
  );
});

test("receipt printer settings keep padded aligned controls at every width", async () => {
  const [styles, catalogManager] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(catalogManagerUrl, "utf8"),
  ]);

  assert.match(catalogManager, /className="receipt-print-settings-copy"/);
  assert.match(catalogManager, /className="receipt-print-settings-controls"/);
  assert.match(catalogManager, /className="receipt-print-settings-actions"/);
  assert.match(
    styles,
    /\.receipt-print-settings-card\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(430px, \.72fr\);[^}]*padding: 20px 22px;/s,
  );
  assert.match(
    styles,
    /\.receipt-print-settings-controls\s*\{[^}]*grid-template-columns: minmax\(220px, 1fr\) auto;[^}]*align-items: end;/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 980px\)[\s\S]*?\.receipt-print-settings-card\s*\{[^}]*grid-template-columns: 1fr;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?\.receipt-print-settings-controls\s*\{[^}]*grid-template-columns: 1fr;/,
  );
  assert.match(styles, /\.category-printer-routes\s*\{[^}]*padding: 18px;/s);
});

test("catalog editors hide the technical slug from administrators", async () => {
  const catalogManager = await readFile(catalogManagerUrl, "utf8");

  assert.doesNotMatch(catalogManager, /data-testid="category-slug"/);
  assert.doesNotMatch(catalogManager, /data-testid="product-slug"/);
  assert.doesNotMatch(catalogManager, /<span>Slug<\/span>/);
  assert.doesNotMatch(catalogManager, /row\.original\.slug/);
  assert.match(catalogManager, /placeholder="Название или описание…"/);
});

test("tablet drawer controls expose stable automation hooks", async () => {
  const dashboard = await readFile(
    new URL(
      "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(dashboard, /data-testid="admin-navigation-toggle"/);
  assert.match(dashboard, /data-testid="admin-navigation-scrim"/);
  assert.match(dashboard, /data-testid="admin-navigation-close"/);
  assert.match(dashboard, /data-testid="admin-navigation"/);
  assert.match(dashboard, /aria-label="Закрыть боковое меню"/);
  assert.match(dashboard, /aria-controls="admin-navigation"/);
  assert.match(dashboard, /onClick=\{\(\) => closeNavigation\(true\)\}/);
  assert.match(dashboard, /type="button"[\s\S]*?admin-navigation-toggle/);
});

test("order kanban wraps at desktop, tablet, and phone breakpoints", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.order-kanban\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?\.order-kanban\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.order-kanban\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(
    styles,
    /\.courier-screen \.order-kanban\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s,
  );
});

test("tablet QA documentation maps every admin route to its real API", async () => {
  const documentation = await readFile(
    new URL("../../../docs/ADMIN_TABLET_QA.md", import.meta.url),
    "utf8",
  );
  const routes = [
    "/orders",
    "/accounting",
    "/couriers/map",
    "/branches",
    "/delivery",
    "/catalog",
    "/marketing",
    "/notifications",
    "/staff",
    "/contacts",
    "/login-attempts",
  ];
  const apiPaths = [
    "/orders?page=1&limit=1",
    "/accounting/settings",
    "/accounting/shifts",
    "/accounting/report",
    "/tracking/dispatch",
    "/branches",
    "/delivery/admin/config",
    "/catalog/admin/categories",
    "/catalog/admin/products",
    "/catalog/admin/receipt-print-settings",
    "/catalog/admin/receipt-printers",
    "/marketing/admin/banners",
    "/marketing/promos",
    "/notifications/admin/campaigns?page=1&limit=25",
    "/staff",
    "/staff/recent-logins",
    "/contacts",
    "/staff/login-attempts?page=1&limit=25",
  ];

  for (const value of [...routes, ...apiPaths]) {
    assert.ok(documentation.includes(`\`${value}\``), `${value} is documented`);
  }
});
