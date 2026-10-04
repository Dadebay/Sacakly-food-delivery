CREATE TYPE "DirectPushStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "DirectPushEvent" (
  "id" UUID NOT NULL,
  "eventKey" VARCHAR(200) NOT NULL,
  "userId" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "offerOrderId" UUID,
  "notificationId" UUID NOT NULL,
  "status" "DirectPushStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentDeviceIds" JSONB NOT NULL DEFAULT '[]',
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "providerMessageId" VARCHAR(500),
  "lastError" VARCHAR(160),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectPushEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectPushEvent_eventKey_key" ON "DirectPushEvent"("eventKey");
CREATE INDEX "DirectPushEvent_status_nextAttemptAt_idx" ON "DirectPushEvent"("status", "nextAttemptAt");
CREATE INDEX "DirectPushEvent_offerOrderId_status_idx" ON "DirectPushEvent"("offerOrderId", "status");
ALTER TABLE "DirectPushEvent" ADD CONSTRAINT "DirectPushEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
