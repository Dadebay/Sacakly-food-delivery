-- Empty tiers preserve the existing day/night kilometer tariffs.
ALTER TABLE "DeliverySettings"
ADD COLUMN "distancePriceTiers" JSONB NOT NULL DEFAULT '[]';
