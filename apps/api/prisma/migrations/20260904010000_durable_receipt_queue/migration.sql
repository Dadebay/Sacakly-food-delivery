CREATE TYPE "ReceiptPrintTaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'UNCERTAIN');
CREATE TABLE "ReceiptPrintQueue" (
  "id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ReceiptPrintQueue_pkey" PRIMARY KEY ("id")
);
-- The permanent row provides a transactional lock for competing consumers.
INSERT INTO "ReceiptPrintQueue" ("id") VALUES ('default');
CREATE TABLE "ReceiptPrintTask" (
  "id" UUID NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "eventKey" VARCHAR(200) NOT NULL,
  "orderId" UUID NOT NULL,
  "documentType" VARCHAR(20) NOT NULL,
  "status" "ReceiptPrintTaskStatus" NOT NULL DEFAULT 'PENDING',
  "dispatchId" UUID NOT NULL,
  "plan" JSONB NOT NULL,
  "stationId" UUID,
  "claimToken" UUID,
  "claimedBy" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "ReceiptPrintTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceiptPrintTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReceiptPrintTask_sequence_key" ON "ReceiptPrintTask"("sequence");
CREATE UNIQUE INDEX "ReceiptPrintTask_eventKey_key" ON "ReceiptPrintTask"("eventKey");
CREATE UNIQUE INDEX "ReceiptPrintTask_dispatchId_key" ON "ReceiptPrintTask"("dispatchId");
CREATE INDEX "ReceiptPrintTask_status_nextAttemptAt_sequence_idx" ON "ReceiptPrintTask"("status", "nextAttemptAt", "sequence");
CREATE INDEX "ReceiptPrintTask_stationId_status_idx" ON "ReceiptPrintTask"("stationId", "status");
CREATE TABLE "OrderCreationRequest" (
  "actorId" UUID NOT NULL,
  "key" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "orderId" UUID NOT NULL,
  CONSTRAINT "OrderCreationRequest_pkey" PRIMARY KEY ("actorId", "key"),
  CONSTRAINT "OrderCreationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderCreationRequest_orderId_key" ON "OrderCreationRequest"("orderId");
-- Intentionally no backfill: existing orders do not trigger paper on rollout.
