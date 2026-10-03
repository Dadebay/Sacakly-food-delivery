ALTER TABLE "InventoryMovement" ADD COLUMN "idempotencyKey" UUID;
CREATE UNIQUE INDEX "InventoryMovement_actorId_idempotencyKey_key"
  ON "InventoryMovement"("actorId", "idempotencyKey");
