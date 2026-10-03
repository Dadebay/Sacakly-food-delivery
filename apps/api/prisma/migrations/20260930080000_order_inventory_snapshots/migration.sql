-- CreateEnum
CREATE TYPE "InventoryRequirementSource" AS ENUM ('RECIPE', 'DIRECT_PRODUCT', 'DIRECT_VARIANT');

-- AlterTable
ALTER TABLE "InventoryDocumentLine" ADD COLUMN     "orderItemId" UUID;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "InventoryOrderRequirement" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productVariantId" UUID,
    "ingredientId" UUID NOT NULL,
    "source" "InventoryRequirementSource" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "recipeVersion" INTEGER,
    "recipeYieldQuantity" DECIMAL(12,3),
    "perSaleQuantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryOrderRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryOrderRequirement_ingredientId_orderId_idx" ON "InventoryOrderRequirement"("ingredientId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOrderRequirement_orderId_orderItemId_ingredientId_key" ON "InventoryOrderRequirement"("orderId", "orderItemId", "ingredientId");

-- AddForeignKey
ALTER TABLE "InventoryOrderRequirement" ADD CONSTRAINT "InventoryOrderRequirement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOrderRequirement" ADD CONSTRAINT "InventoryOrderRequirement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
