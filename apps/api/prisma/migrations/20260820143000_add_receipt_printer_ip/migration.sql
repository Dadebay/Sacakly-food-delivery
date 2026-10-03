ALTER TABLE "Product"
ADD COLUMN "receiptPrinterIp" VARCHAR(15);

ALTER TABLE "OrderItem"
ADD COLUMN "receiptPrinterIp" VARCHAR(15);
