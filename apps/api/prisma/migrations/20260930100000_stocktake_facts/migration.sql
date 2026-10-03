ALTER TABLE "InventoryDocument"
ADD COLUMN "stocktakeExpectedQuantity" DECIMAL(12,3),
ADD COLUMN "stocktakeCountedQuantity" DECIMAL(12,3);
