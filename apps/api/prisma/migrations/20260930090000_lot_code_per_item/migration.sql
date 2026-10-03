-- DropIndex
DROP INDEX "InventoryLot_branchId_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_ingredientId_branchId_code_key" ON "InventoryLot"("ingredientId", "branchId", "code");
