ALTER TABLE "InventoryMovement" ADD COLUMN "orderId" UUID;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");
CREATE INDEX "InventoryMovement_createdAt_id_idx" ON "InventoryMovement"("createdAt", "id");

CREATE TABLE "InventoryAllocatedProduct" (
  "orderId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "InventoryAllocatedProduct_pkey" PRIMARY KEY ("orderId", "productId"),
  CONSTRAINT "InventoryAllocatedProduct_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "InventoryAllocatedProduct_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
