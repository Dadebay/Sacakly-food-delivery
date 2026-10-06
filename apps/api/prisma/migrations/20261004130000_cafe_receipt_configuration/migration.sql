CREATE TABLE "CafeReceiptConfiguration" (
  "cafeId" UUID NOT NULL,
  "mainPrinterId" UUID,
  "mainCopies" INTEGER NOT NULL DEFAULT 1,
  "businessPhone" VARCHAR(24),
  "agentTokenHash" VARCHAR(64),
  "tokenIssuedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CafeReceiptConfiguration_pkey" PRIMARY KEY ("cafeId")
);

CREATE UNIQUE INDEX "CafeReceiptConfiguration_agentTokenHash_key" ON "CafeReceiptConfiguration"("agentTokenHash");
CREATE INDEX "CafeReceiptConfiguration_mainPrinterId_idx" ON "CafeReceiptConfiguration"("mainPrinterId");
ALTER TABLE "CafeReceiptConfiguration" ADD CONSTRAINT "CafeReceiptConfiguration_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CafeReceiptConfiguration" ADD CONSTRAINT "CafeReceiptConfiguration_mainPrinterId_fkey" FOREIGN KEY ("mainPrinterId") REFERENCES "ReceiptPrinter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
