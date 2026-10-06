DROP INDEX "ReceiptPrinter_ipAddress_port_key";
CREATE UNIQUE INDEX "ReceiptPrinter_cafeId_ipAddress_port_key" ON "ReceiptPrinter"("cafeId", "ipAddress", "port");
-- PostgreSQL treats NULL as distinct in the compound key above. Preserve the
-- historical one-endpoint-one-printer rule for legacy unscoped printers.
CREATE UNIQUE INDEX "ReceiptPrinter_legacy_ipAddress_port_key" ON "ReceiptPrinter"("ipAddress", "port") WHERE "cafeId" IS NULL;
