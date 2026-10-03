import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { orderCourierEditFormSchema } from "../src/features/order-management/model/order-courier-edit-form.ts";

const dialogUrl = new URL(
  "../src/features/order-management/ui/order-courier-edit-dialog.tsx",
  import.meta.url,
);
const actionsUrl = new URL(
  "../src/features/order-management/api/use-order-actions.ts",
  import.meta.url,
);
const adminDialogUrl = new URL(
  "../src/features/order-management/ui/order-admin-edit-dialog.tsx",
  import.meta.url,
);

test("courier correction form requires a real courier id", () => {
  assert.equal(
    orderCourierEditFormSchema.safeParse({
      courierId: "11111111-1111-4111-8111-111111111111",
    }).success,
    true,
  );
  assert.equal(
    orderCourierEditFormSchema.safeParse({ courierId: "" }).success,
    false,
  );
});

test("administrator editor covers items, map, delivery area and order details", async () => {
  const [dialog, actions] = await Promise.all([
    readFile(adminDialogUrl, "utf8"),
    readFile(actionsUrl, "utf8"),
  ]);

  assert.match(dialog, /DeliveryLocationPicker/);
  assert.match(dialog, /useDeliveryQuote/);
  assert.match(dialog, /deliveryEtrapId/);
  assert.match(dialog, /customerNote/);
  assert.match(dialog, /items: items\.map/);
  assert.match(dialog, /version: order\.version/);
  assert.match(actions, /\/orders\/\$\{orderId\}\/admin-edit/);
});

test("order editor uses RHF, locking version and the real assignment API", async () => {
  const [dialog, actions] = await Promise.all([
    readFile(dialogUrl, "utf8"),
    readFile(actionsUrl, "utf8"),
  ]);

  assert.match(dialog, /useForm<OrderCourierEditFormValues>/);
  assert.match(dialog, /data-testid="order-courier-edit-dialog"/);
  assert.match(dialog, /data-testid="order-courier-edit-submit"/);
  assert.match(dialog, /version: order\.version/);
  assert.match(actions, /\/orders\/\$\{orderId\}\/assign-courier/);
});
