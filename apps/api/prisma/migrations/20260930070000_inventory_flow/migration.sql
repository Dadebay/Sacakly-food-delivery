-- CreateEnum
CREATE TYPE "InventoryDocumentKind" AS ENUM ('RECEIPT', 'TRANSFER', 'PROCESS', 'WASTE', 'STOCKTAKE', 'ORDER_ISSUE', 'LEGACY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InventoryLineKind" AS ENUM ('IN', 'OUT', 'PROCESS_WASTE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stockIngredientId" UUID,
ADD COLUMN     "stockQuantity" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "stockIngredientId" UUID,
ADD COLUMN     "stockQuantity" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "unitCost" DECIMAL(12,6) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "originNote" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLotBalance" (
    "lotId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryLotBalance_pkey" PRIMARY KEY ("lotId","locationId")
);

-- CreateTable
CREATE TABLE "InventoryDocument" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "actorId" UUID,
    "orderId" UUID,
    "idempotencyKey" UUID,
    "requestFingerprint" VARCHAR(64),
    "kind" "InventoryDocumentKind" NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocumentLine" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "kind" "InventoryLineKind" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "InventoryDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_branchId_code_key" ON "InventoryLocation"("branchId", "code");

-- CreateIndex
CREATE INDEX "InventoryLot_ingredientId_branchId_createdAt_idx" ON "InventoryLot"("ingredientId", "branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_branchId_code_key" ON "InventoryLot"("branchId", "code");

-- CreateIndex
CREATE INDEX "InventoryDocument_branchId_createdAt_idx" ON "InventoryDocument"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryDocument_orderId_idx" ON "InventoryDocument"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_actorId_idempotencyKey_key" ON "InventoryDocument"("actorId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_orderId_kind_key" ON "InventoryDocument"("orderId", "kind");

-- CreateIndex
CREATE INDEX "InventoryDocumentLine_lotId_documentId_idx" ON "InventoryDocumentLine"("lotId", "documentId");

-- CreateIndex
CREATE INDEX "InventoryDocumentLine_locationId_documentId_idx" ON "InventoryDocumentLine"("locationId", "documentId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockIngredientId_fkey" FOREIGN KEY ("stockIngredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_stockIngredientId_fkey" FOREIGN KEY ("stockIngredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLotBalance" ADD CONSTRAINT "InventoryLotBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLotBalance" ADD CONSTRAINT "InventoryLotBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defensive invariants for posted physical stock and direct-sale mapping.
ALTER TABLE "InventoryLotBalance" ADD CONSTRAINT "InventoryLotBalance_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_unitCost_nonnegative" CHECK ("unitCost" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_link_complete" CHECK (("stockIngredientId" IS NULL) = ("stockQuantity" IS NULL) AND ("stockQuantity" IS NULL OR "stockQuantity" > 0));
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_stock_link_complete" CHECK (("stockIngredientId" IS NULL) = ("stockQuantity" IS NULL) AND ("stockQuantity" IS NULL OR "stockQuantity" > 0));
