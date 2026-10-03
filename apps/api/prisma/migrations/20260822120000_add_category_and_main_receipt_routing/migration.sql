-- Category routes are defaults. A product route remains an optional override.
ALTER TABLE "Category"
ADD COLUMN "receiptPrinterIp" VARCHAR(15);

-- The full administrator copy uses a separately managed physical printer.
CREATE TABLE "ReceiptPrintSettings" (
    "id" VARCHAR(40) NOT NULL DEFAULT 'default',
    "mainPrinterIp" VARCHAR(15),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptPrintSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ReceiptPrintSettings" ("id", "mainPrinterIp")
VALUES ('default', NULL);
