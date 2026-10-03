-- Disabled by default. Existing configured tariffs are preserved as the
-- initial night prices, including their existing free-delivery thresholds.
ALTER TABLE "DeliverySettings"
  ADD COLUMN "fallbackNightPrice" DECIMAL(12,2) NOT NULL DEFAULT 15,
  ADD COLUMN "fallbackNightFreeDeliveryThreshold" DECIMAL(12,2) DEFAULT 150,
  ADD COLUMN "nightTariffEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nightStartsAt" VARCHAR(5) NOT NULL DEFAULT '23:00',
  ADD COLUMN "nightEndsAt" VARCHAR(5) NOT NULL DEFAULT '07:00',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "DeliverySettings" SET "fallbackNightPrice" = "fallbackPrice",
  "fallbackNightFreeDeliveryThreshold" = "fallbackFreeDeliveryThreshold";
ALTER TABLE "Etrap"
  ADD COLUMN "nightPrice" DECIMAL(12,2) NOT NULL DEFAULT 15,
  ADD COLUMN "nightFreeDeliveryThreshold" DECIMAL(12,2) DEFAULT 150,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "Etrap" SET "nightPrice" = "price",
  "nightFreeDeliveryThreshold" = "freeDeliveryThreshold";
ALTER TABLE "DeliverySettings" ADD CONSTRAINT "DeliverySettings_night_hours_check"
  CHECK ("nightStartsAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "nightEndsAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "nightStartsAt" <> "nightEndsAt");
