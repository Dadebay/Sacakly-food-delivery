-- The existing customer inbox/outbox and campaign audience remain unchanged.
ALTER TYPE "NotificationAudience" ADD VALUE 'ALL_APP_INSTALLATIONS';
ALTER TABLE "NotificationCampaign"
  ADD COLUMN "topic" VARCHAR(100),
  ADD COLUMN "topicMessageId" VARCHAR(500),
  ADD COLUMN "topicErrorCode" VARCHAR(160),
  ADD COLUMN "idempotencyKey" UUID,
  ADD COLUMN "dispatchToken" UUID;
CREATE UNIQUE INDEX "NotificationCampaign_createdById_idempotencyKey_key"
  ON "NotificationCampaign"("createdById", "idempotencyKey");
