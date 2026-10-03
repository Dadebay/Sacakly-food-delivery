-- CreateEnum
CREATE TYPE "LoyaltyEntryKind" AS ENUM ('EARN', 'REDEEM', 'REFUND', 'REVERSE_EARN');

-- AlterTable
ALTER TABLE "DeliverySettings" ADD COLUMN     "dayPricePerKilometer" DECIMAL(12,2),
ADD COLUMN     "distancePricingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nightPricePerKilometer" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyPointsSpent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pointsBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Gift" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "stock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGift" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "giftId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,

    CONSTRAINT "OrderGift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" "LoyaltyEntryKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gift_isActive_sortOrder_idx" ON "Gift"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "OrderGift_giftId_idx" ON "OrderGift"("giftId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderGift_orderId_giftId_key" ON "OrderGift"("orderId", "giftId");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_userId_createdAt_idx" ON "LoyaltyEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_orderId_kind_key" ON "LoyaltyEntry"("orderId", "kind");

-- AddForeignKey
ALTER TABLE "OrderGift" ADD CONSTRAINT "OrderGift_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGift" ADD CONSTRAINT "OrderGift_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_loyaltyPoints_check" CHECK ("loyaltyPoints" >= 1);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_loyaltyPoints_check" CHECK ("loyaltyPoints" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_loyaltyPoints_check" CHECK ("loyaltyPointsEarned" >= 0 AND "loyaltyPointsSpent" >= 0);
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_pointsCost_stock_check" CHECK ("pointsCost" > 0 AND ("stock" IS NULL OR "stock" >= 0));
ALTER TABLE "OrderGift" ADD CONSTRAINT "OrderGift_points_quantity_check" CHECK ("pointsCost" > 0 AND "quantity" > 0 AND "totalPoints" = "pointsCost" * "quantity");
ALTER TABLE "DeliverySettings" ADD CONSTRAINT "DeliverySettings_kilometer_rates_check" CHECK (
  ("dayPricePerKilometer" IS NULL OR "dayPricePerKilometer" > 0)
  AND ("nightPricePerKilometer" IS NULL OR "nightPricePerKilometer" > 0)
  AND (NOT "distancePricingEnabled" OR ("dayPricePerKilometer" IS NOT NULL AND "nightPricePerKilometer" IS NOT NULL))
);
