import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsUrl = new URL(
  "../src/features/marketing-management/api/use-marketing-actions.ts",
  import.meta.url,
);
const managerUrl = new URL(
  "../src/widgets/marketing-manager/ui/marketing-manager.tsx",
  import.meta.url,
);
const confirmDeleteDialogUrl = new URL(
  "../src/shared/ui/confirm-delete-dialog.tsx",
  import.meta.url,
);

test("banner deletion uses the authenticated API and refreshes marketing data", async () => {
  const actions = await readFile(actionsUrl, "utf8");

  assert.match(actions, /const deleteBanner = useMutation/);
  assert.match(actions, /`\/marketing\/banners\/\$\{id\}`/);
  assert.match(actions, /method: "DELETE"/);
  assert.match(actions, /queryKey: \[\.\.\.marketingQueryKeys\.all, "banners"\]/);
  assert.match(actions, /onSuccess: refreshBanners/);
  assert.match(actions, /deleteBanner,/);
});

test("banner deletion requires an explicit accessible confirmation", async () => {
  const [manager, confirmDeleteDialog] = await Promise.all([
    readFile(managerUrl, "utf8"),
    readFile(confirmDeleteDialogUrl, "utf8"),
  ]);

  assert.match(manager, /\[bannerDelete, setBannerDelete\]/);
  assert.match(manager, /data-testid=\{`banner-delete-open-\$\{row\.original\.id\}`\}/);
  // Banner deletion delegates its confirmation UI to the shared
  // ConfirmDeleteDialog (shared/ui/confirm-delete-dialog.tsx).
  assert.match(manager, /<ConfirmDeleteDialog/);
  assert.match(manager, /dialogTestId="banner-delete-dialog"/);
  assert.match(manager, /cancelTestId="banner-delete-cancel"/);
  assert.match(manager, /confirmTestId="banner-delete-confirm"/);
  assert.match(manager, /isPending=\{marketing\.deleteBanner\.isPending\}/);
  assert.match(manager, /await marketing\.deleteBanner\.mutateAsync/);
  assert.match(manager, /Файл изображения останется в приватном/);

  assert.match(confirmDeleteDialog, /data-testid=\{dialogTestId\}/);
  assert.match(confirmDeleteDialog, /role="alertdialog"/);
  assert.match(confirmDeleteDialog, /aria-modal="true"/);
  assert.match(confirmDeleteDialog, /data-testid=\{cancelTestId\}/);
  assert.match(confirmDeleteDialog, /data-testid=\{confirmTestId\}/);
  assert.match(confirmDeleteDialog, /Удалить навсегда/);
});
