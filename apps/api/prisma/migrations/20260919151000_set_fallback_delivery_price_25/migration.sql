ALTER TABLE "DeliverySettings"
  ALTER COLUMN "fallbackPrice" SET DEFAULT 25,
  ALTER COLUMN "fallbackNightPrice" SET DEFAULT 25;

UPDATE "DeliverySettings"
SET "fallbackPrice" = 25,
    "fallbackNightPrice" = 25,
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default';
