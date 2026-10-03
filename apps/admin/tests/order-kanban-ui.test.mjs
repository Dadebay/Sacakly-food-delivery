import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const kanbanUrl = new URL(
  "../src/widgets/order-board/ui/order-kanban.tsx",
  import.meta.url,
);
const boardUrl = new URL(
  "../src/widgets/order-board/ui/order-board.tsx",
  import.meta.url,
);
const courierUrl = new URL(
  "../src/widgets/courier-tracking/ui/courier-tracking-screen.tsx",
  import.meta.url,
);

test("kanban exposes stable automation hooks for lanes, cards, and actions", async () => {
  const source = await readFile(kanbanUrl, "utf8");

  assert.match(source, /data-testid="order-kanban"/);
  assert.match(source, /data-testid=\{`order-kanban-column-\$\{lane\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-kanban-card-\$\{order\.id\}`\}/);
  assert.match(
    source,
    /data-testid=\{`order-kanban-transition-\$\{order\.id\}`\}/,
  );
  assert.match(source, /data-testid=\{`order-kanban-cancel-\$\{order\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-kanban-edit-\$\{order\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-kanban-print-\$\{order\.id\}`\}/);
  assert.match(source, /<OrderPackingChecklist/);
  assert.match(source, /testId=\{`order-kanban-payment-\$\{order\.id\}`\}/);
  assert.match(source, /canOpenDetails &&/);
});

test("order views show food, delivery, and total as separate amounts", async () => {
  const [board, detail, payment] = await Promise.all([
    readFile(boardUrl, "utf8"),
    readFile(
      new URL(
        "../src/widgets/order-board/ui/order-detail-dialog.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/entities/order/ui/order-payment-breakdown.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(board, /testId=\{`order-table-payment-/);
  assert.match(detail, /data-testid=\{`order-detail-payment-/);
  assert.match(payment, /<dt>Еда<\/dt>/);
  assert.match(payment, /<dt>Доставка<\/dt>/);
  assert.match(payment, /<dt>Итого<\/dt>/);
});

test("cooking and ready orders expose packing controls before courier handoff", async () => {
  const [board, checklist] = await Promise.all([
    readFile(boardUrl, "utf8"),
    readFile(
      new URL(
        "../src/widgets/order-board/ui/order-packing-checklist.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(board, /data-testid="orders-header-actions"/);
  assert.match(
    checklist,
    /data-testid=\{`order-packing-checklist-\$\{order\.id\}`\}/,
  );
  assert.match(
    checklist,
    /data-testid=\{`order-packing-item-\$\{order\.id\}-\$\{item\.id\}`\}/,
  );
  assert.match(
    checklist,
    /data-testid=\{`order-confirm-packing-\$\{order\.id\}`\}/,
  );
  assert.match(
    checklist,
    /order\.status !== "COOKING" && order\.status !== "READY"/,
  );
  assert.match(checklist, /Соберите заказ/);
  assert.match(checklist, /order.items.length > 0/);
  assert.match(checklist, /Заказ готов — к передаче курьеру/);
  assert.match(checklist, /checkedCount/);
  assert.match(checklist, /disabled=\{!allChecked \|\| pending\}/);
});

test("kanban actions reuse backend-owned transition, assignment, and cancellation mutations", async () => {
  const source = await readFile(boardUrl, "utf8");

  assert.match(source, /actions\.transition\.mutate/);
  assert.match(source, /actions\.assignCourier\.mutate/);
  assert.match(source, /actions\.confirmPacking\.mutate/);
  assert.match(source, /actions\.cancel\.mutate/);
  assert.match(source, /version: order\.version/);
  assert.match(source, /limit: viewMode === "kanban" \? 100 : 25/);
  assert.match(source, /kanbanQueueStatusesForRole\(role\)/);
  assert.match(source, /data-testid="orders-view-kanban"/);
  assert.match(source, /data-testid="orders-view-table"/);
  assert.match(source, /data-testid=\{`order-table-edit-\$\{order\.id\}`\}/);
  assert.match(source, /data-testid=\{`order-table-print-\$\{order\.id\}`\}/);
});

test("kanban virtualizes large lanes and keeps history collapsed", async () => {
  const source = await readFile(kanbanUrl, "utf8");

  assert.match(source, /useVirtualizer\(\{/);
  assert.match(source, /getItemKey,/);
  assert.match(source, /overscan: 3/);
  assert.match(source, /useFlushSync: false/);
  assert.match(source, /data-testid="order-kanban-archive"/);
  assert.match(source, /className="order-kanban-card-summary"/);
  assert.match(
    source,
    /data-testid=\{`order-kanban-summary-\$\{order\.id\}`\}/,
  );
  assert.match(
    source,
    /const \[isExpanded, setIsExpanded\] = useState\(false\)/,
  );
  assert.match(source, /estimateSize: \(\) => 78/);
  assert.doesNotMatch(source, /startsExpanded/);
});

test("courier workspace renders assigned orders beside GPS sharing", async () => {
  const source = await readFile(courierUrl, "utf8");

  assert.match(source, /<CourierLocationSharing \/>/);
  assert.match(source, /title="Мои доставки"/);
  assert.match(source, /defaultView="kanban"/);
});
