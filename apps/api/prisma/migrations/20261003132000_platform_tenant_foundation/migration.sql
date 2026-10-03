-- CreateEnum
CREATE TYPE "CourierApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ReceiptPrinter" ADD COLUMN     "cafeId" UUID;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "cafeId" UUID;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cafeId" UUID;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "cafeId" UUID;

-- CreateTable
CREATE TABLE "PlatformOwner" (
    "userId" UUID NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformOwner_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CafeMembership" (
    "cafeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeMembership_pkey" PRIMARY KEY ("cafeId","userId")
);

-- CreateTable
CREATE TABLE "CafeModuleEntitlement" (
    "cafeId" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeModuleEntitlement_pkey" PRIMARY KEY ("cafeId","key")
);

-- CreateTable
CREATE TABLE "CourierApplication" (
    "userId" UUID NOT NULL,
    "status" "CourierApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(500),
    "reviewedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CourierApplication_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOwner_phone_key" ON "PlatformOwner"("phone");

-- CreateIndex
CREATE INDEX "CafeMembership_userId_isActive_idx" ON "CafeMembership"("userId", "isActive");

-- CreateIndex
CREATE INDEX "CafeModuleEntitlement_key_enabled_idx" ON "CafeModuleEntitlement"("key", "enabled");

-- CreateIndex
CREATE INDEX "CourierApplication_status_createdAt_idx" ON "CourierApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReceiptPrinter_cafeId_isActive_idx" ON "ReceiptPrinter"("cafeId", "isActive");

-- CreateIndex
CREATE INDEX "Branch_cafeId_isActive_idx" ON "Branch"("cafeId", "isActive");

-- CreateIndex
CREATE INDEX "Order_cafeId_status_createdAt_idx" ON "Order"("cafeId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformOwner" ADD CONSTRAINT "PlatformOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeMembership" ADD CONSTRAINT "CafeMembership_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeMembership" ADD CONSTRAINT "CafeMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeModuleEntitlement" ADD CONSTRAINT "CafeModuleEntitlement_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeModuleEntitlement" ADD CONSTRAINT "CafeModuleEntitlement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierApplication" ADD CONSTRAINT "CourierApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierApplication" ADD CONSTRAINT "CourierApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptPrinter" ADD CONSTRAINT "ReceiptPrinter_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
