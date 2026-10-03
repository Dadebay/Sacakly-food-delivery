ALTER TABLE "ReceiptPrintSettings" ADD COLUMN "mainCopies" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Product" ADD COLUMN "preparationMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "preparationMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "ReceiptPrintTaskStatus" ADD VALUE 'CANCELLED';

CREATE TABLE "OrderingHoursSettings" (
  "id" VARCHAR(40) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "opensAt" VARCHAR(5) NOT NULL DEFAULT '09:00',
  "closesAt" VARCHAR(5) NOT NULL DEFAULT '22:00',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderingHoursSettings_pkey" PRIMARY KEY ("id")
);
