-- Registered printers remove endpoint details from category/product forms while
-- retaining the old IP columns as a backward-compatible API fallback.
CREATE TYPE "ReceiptPrinterTransport" AS ENUM ('RAW_TCP', 'JSPEED_HTTP');

CREATE TABLE "ReceiptPrinter" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "ipAddress" VARCHAR(15) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "transport" "ReceiptPrinterTransport" NOT NULL DEFAULT 'RAW_TCP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptPrinter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReceiptPrinter_ipAddress_port_key"
ON "ReceiptPrinter"("ipAddress", "port");
CREATE INDEX "ReceiptPrinter_isActive_name_idx"
ON "ReceiptPrinter"("isActive", "name");

ALTER TABLE "Category" ADD COLUMN "receiptPrinterId" UUID;
ALTER TABLE "Product" ADD COLUMN "receiptPrinterId" UUID;
ALTER TABLE "ReceiptPrintSettings" ADD COLUMN "mainPrinterId" UUID;
ALTER TABLE "OrderItem"
ADD COLUMN "receiptPrinterPort" INTEGER,
ADD COLUMN "receiptPrinterTransport" "ReceiptPrinterTransport";

-- Existing addresses used the J-Speed WebConfig endpoint on port 80. Convert
-- every distinct configured address into one editable registry record.
INSERT INTO "ReceiptPrinter" (
    "id", "name", "ipAddress", "port", "transport", "isActive", "updatedAt"
)
SELECT
    md5('receipt-printer:' || addresses."ipAddress")::uuid,
    'Аппарат ' || addresses."ipAddress",
    addresses."ipAddress",
    80,
    'JSPEED_HTTP'::"ReceiptPrinterTransport",
    true,
    CURRENT_TIMESTAMP
FROM (
    SELECT "receiptPrinterIp" AS "ipAddress" FROM "Category"
    UNION
    SELECT "receiptPrinterIp" AS "ipAddress" FROM "Product"
    UNION
    SELECT "mainPrinterIp" AS "ipAddress" FROM "ReceiptPrintSettings"
) AS addresses
WHERE addresses."ipAddress" IS NOT NULL;

UPDATE "Category" AS category
SET "receiptPrinterId" = printer."id"
FROM "ReceiptPrinter" AS printer
WHERE category."receiptPrinterIp" = printer."ipAddress";

UPDATE "Product" AS product
SET "receiptPrinterId" = printer."id"
FROM "ReceiptPrinter" AS printer
WHERE product."receiptPrinterIp" = printer."ipAddress";

UPDATE "ReceiptPrintSettings" AS settings
SET "mainPrinterId" = printer."id"
FROM "ReceiptPrinter" AS printer
WHERE settings."mainPrinterIp" = printer."ipAddress";

UPDATE "OrderItem"
SET
    "receiptPrinterPort" = 80,
    "receiptPrinterTransport" = 'JSPEED_HTTP'::"ReceiptPrinterTransport"
WHERE "receiptPrinterIp" IS NOT NULL;

CREATE INDEX "Category_receiptPrinterId_idx" ON "Category"("receiptPrinterId");
CREATE INDEX "Product_receiptPrinterId_idx" ON "Product"("receiptPrinterId");
CREATE INDEX "ReceiptPrintSettings_mainPrinterId_idx"
ON "ReceiptPrintSettings"("mainPrinterId");

ALTER TABLE "Category"
ADD CONSTRAINT "Category_receiptPrinterId_fkey"
FOREIGN KEY ("receiptPrinterId") REFERENCES "ReceiptPrinter"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_receiptPrinterId_fkey"
FOREIGN KEY ("receiptPrinterId") REFERENCES "ReceiptPrinter"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReceiptPrintSettings"
ADD CONSTRAINT "ReceiptPrintSettings_mainPrinterId_fkey"
FOREIGN KEY ("mainPrinterId") REFERENCES "ReceiptPrinter"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
