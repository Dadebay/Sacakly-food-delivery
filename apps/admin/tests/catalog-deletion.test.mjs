import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsUrl = new URL(
  "../src/features/catalog-management/api/use-catalog-actions.ts",
  import.meta.url,
);
const managerUrl = new URL(
  "../src/widgets/catalog-manager/ui/catalog-manager.tsx",
  import.meta.url,
);
const confirmDeleteDialogUrl = new URL(
  "../src/shared/ui/confirm-delete-dialog.tsx",
  import.meta.url,
);

test("catalog deletion uses authenticated DELETE endpoints and refreshes catalog data", async () => {
  const actions = await readFile(actionsUrl, "utf8");

  assert.match(actions, /const deleteCategory = useMutation/);
  assert.match(actions, /`\/catalog\/categories\/\$\{id\}`/);
  assert.match(actions, /const deleteProduct = useMutation/);
  assert.match(actions, /`\/catalog\/products\/\$\{id\}`/);
  assert.match(actions, /const deleteReceiptPrinter = useMutation/);
  assert.match(actions, /`\/catalog\/receipt-printers\/\$\{id\}`/);
  assert.match(actions, /const deleteCafe = useMutation/);
  assert.match(actions, /`\/catalog\/cafes\/\$\{id\}`/);
  assert.equal(actions.match(/method: "DELETE"/g)?.length, 4);
  assert.equal(actions.match(/onSuccess: refresh/g)?.length, 13);
  assert.match(actions, /deleteCategory,/);
  assert.match(actions, /deleteProduct,/);
  assert.match(actions, /deleteReceiptPrinter,/);
  assert.match(actions, /deleteCafe,/);
});

test("catalog records require an explicit accessible deletion confirmation", async () => {
  const [manager, confirmDeleteDialog] = await Promise.all([
    readFile(managerUrl, "utf8"),
    readFile(confirmDeleteDialogUrl, "utf8"),
  ]);

  assert.match(manager, /\[catalogDelete, setCatalogDelete\]/);
  assert.match(manager, /category-delete-table-open-\$\{row\.original\.id\}/);
  assert.match(manager, /product-delete-open-\$\{row\.original\.id\}/);
  // Catalog delegates its confirmation UI to the shared ConfirmDeleteDialog
  // (shared/ui/confirm-delete-dialog.tsx) instead of rolling its own modal.
  assert.match(manager, /<ConfirmDeleteDialog/);
  assert.match(manager, /dialogTestId="catalog-delete-dialog"/);
  assert.match(manager, /cancelTestId="catalog-delete-cancel"/);
  assert.match(manager, /confirmTestId="catalog-delete-confirm"/);
  assert.match(manager, /isPending=\{[\s\S]{0,80}deleteCategory\.isPending/);
  assert.match(manager, /deleteProduct\.isPending/);
  assert.match(manager, /await actions\.deleteCategory\.mutateAsync/);
  assert.match(manager, /await actions\.deleteProduct\.mutateAsync/);
  assert.match(manager, /Если блюдо уже есть в истории заказов/);

  assert.match(confirmDeleteDialog, /data-testid=\{dialogTestId\}/);
  assert.match(confirmDeleteDialog, /role="alertdialog"/);
  assert.match(confirmDeleteDialog, /aria-modal="true"/);
  assert.match(confirmDeleteDialog, /data-testid=\{cancelTestId\}/);
  assert.match(confirmDeleteDialog, /data-testid=\{confirmTestId\}/);
  assert.match(confirmDeleteDialog, /Удалить навсегда/);
});
