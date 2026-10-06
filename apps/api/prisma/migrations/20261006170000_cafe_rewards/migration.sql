-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "cafeId" UUID;

-- AlterTable
ALTER TABLE "LoyaltyEntry" ADD COLUMN     "cafeId" UUID;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cafePromotionId" UUID,
ADD COLUMN     "loyaltyCafeId" UUID,
ADD COLUMN     "promotionLabel" VARCHAR(160);

-- CreateTable
CREATE TABLE "CafePromotion" (
    "id" UUID NOT NULL,
    "cafeId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40),
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "type" "PromoType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "minOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxDiscountAmount" DECIMAL(12,2),
    "totalUsageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafePromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeLoyaltyWallet" (
    "cafeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeLoyaltyWallet_pkey" PRIMARY KEY ("cafeId","userId")
);

-- CreateIndex
CREATE INDEX "CafePromotion_cafeId_isActive_idx" ON "CafePromotion"("cafeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CafePromotion_cafeId_code_key" ON "CafePromotion"("cafeId", "code");

-- CreateIndex
CREATE INDEX "CafeLoyaltyWallet_userId_idx" ON "CafeLoyaltyWallet"("userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cafePromotionId_fkey" FOREIGN KEY ("cafePromotionId") REFERENCES "CafePromotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafePromotion" ADD CONSTRAINT "CafePromotion_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeLoyaltyWallet" ADD CONSTRAINT "CafeLoyaltyWallet_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeLoyaltyWallet" ADD CONSTRAINT "CafeLoyaltyWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE INDEX "Gift_cafeId_isActive_idx" ON "Gift"("cafeId", "isActive");
CREATE INDEX "LoyaltyEntry_cafeId_userId_createdAt_idx" ON "LoyaltyEntry"("cafeId", "userId", "createdAt");
CREATE INDEX "Order_cafePromotionId_customerId_idx" ON "Order"("cafePromotionId", "customerId");
-- New cafe wallets cannot be attributed to another cafe; historical orders keep NULL.
ALTER TABLE "Order" ADD CONSTRAINT "Order_loyalty_scope_check" CHECK ("loyaltyCafeId" IS NULL OR ("cafeId" IS NOT NULL AND "loyaltyCafeId" = "cafeId"));

-- Cafe dishes may explicitly earn no points; legacy API validation stays >= 1.
ALTER TABLE "Product" DROP CONSTRAINT "Product_loyaltyPoints_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_loyaltyPoints_check" CHECK ("loyaltyPoints" >= 0);
