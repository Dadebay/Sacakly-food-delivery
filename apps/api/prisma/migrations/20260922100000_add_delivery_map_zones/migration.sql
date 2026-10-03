ALTER TABLE "DeliverySettings"
ADD COLUMN "mapPricingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Etrap"
ADD COLUMN "deliveryZone" JSONB;
