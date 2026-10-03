ALTER TABLE "Product"
ADD COLUMN "variantLabel" VARCHAR(80);

CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300),
    "price" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariantImage" (
    "id" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt" VARCHAR(180),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariantImage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderItem"
ADD COLUMN "productVariantId" UUID,
ADD COLUMN "variantName" VARCHAR(120);

CREATE UNIQUE INDEX "ProductVariant_productId_name_key"
ON "ProductVariant"("productId", "name");

CREATE INDEX "ProductVariant_productId_isActive_sortOrder_idx"
ON "ProductVariant"("productId", "isActive", "sortOrder");

CREATE INDEX "ProductVariant_productId_isActive_price_idx"
ON "ProductVariant"("productId", "isActive", "price");

CREATE INDEX "ProductVariantImage_productVariantId_sortOrder_idx"
ON "ProductVariantImage"("productVariantId", "sortOrder");

CREATE INDEX "OrderItem_productVariantId_idx"
ON "OrderItem"("productVariantId");

ALTER TABLE "ProductVariant"
ADD CONSTRAINT "ProductVariant_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductVariantImage"
ADD CONSTRAINT "ProductVariantImage_productVariantId_fkey"
FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_productVariantId_fkey"
FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
