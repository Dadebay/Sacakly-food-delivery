CREATE TYPE "InventoryUnit" AS ENUM ('GRAM', 'MILLILITER', 'PIECE');
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT');

CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(80),
    "unit" "InventoryUnit" NOT NULL,
    "costPerUnit" DECIMAL(12,6) NOT NULL,
    "reorderPoint" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recipe" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "yieldQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeIngredient" (
    "id" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngredientStock" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngredientStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "actorId" UUID,
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" DECIMAL(12,3) NOT NULL,
    "quantityAfter" DECIMAL(12,3) NOT NULL,
    "reason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ingredient_sku_key" ON "Ingredient"("sku");
CREATE INDEX "Ingredient_isActive_name_idx" ON "Ingredient"("isActive", "name");
CREATE UNIQUE INDEX "Recipe_productId_key" ON "Recipe"("productId");
CREATE INDEX "Recipe_isActive_idx" ON "Recipe"("isActive");
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");
CREATE UNIQUE INDEX "IngredientStock_ingredientId_branchId_key" ON "IngredientStock"("ingredientId", "branchId");
CREATE INDEX "IngredientStock_branchId_updatedAt_idx" ON "IngredientStock"("branchId", "updatedAt");
CREATE INDEX "InventoryMovement_ingredientId_branchId_createdAt_idx" ON "InventoryMovement"("ingredientId", "branchId", "createdAt");
CREATE INDEX "InventoryMovement_branchId_createdAt_idx" ON "InventoryMovement"("branchId", "createdAt");

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngredientStock" ADD CONSTRAINT "IngredientStock_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngredientStock" ADD CONSTRAINT "IngredientStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_reorderPoint_nonnegative" CHECK ("reorderPoint" >= 0);
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_yieldQuantity_positive" CHECK ("yieldQuantity" > 0);
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "IngredientStock" ADD CONSTRAINT "IngredientStock_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_quantityDelta_nonzero" CHECK ("quantityDelta" <> 0);
