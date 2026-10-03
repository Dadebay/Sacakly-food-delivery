CREATE TYPE "ProductPricingType" AS ENUM ('FIXED', 'VARIANT');

ALTER TABLE "Product"
ADD COLUMN "pricingType" "ProductPricingType" NOT NULL DEFAULT 'FIXED';

UPDATE "Product" AS product
SET "pricingType" = 'VARIANT'
WHERE EXISTS (
  SELECT 1
  FROM "ProductVariant" AS variant
  WHERE variant."productId" = product."id"
);
