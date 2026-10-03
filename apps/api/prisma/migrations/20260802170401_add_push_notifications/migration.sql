-- CreateEnum
CREATE TYPE "PushDevicePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ALL_CUSTOMERS');

-- CreateEnum
CREATE TYPE "NotificationCampaignStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "installationId" VARCHAR(255) NOT NULL,
    "platform" "PushDevicePlatform" NOT NULL,
    "appVersion" VARCHAR(40),
    "locale" VARCHAR(16),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationCampaign" (
    "id" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "deepLink" VARCHAR(500),
    "audience" "NotificationAudience" NOT NULL DEFAULT 'ALL_CUSTOMERS',
    "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'PENDING',
    "intendedUserCount" INTEGER NOT NULL DEFAULT 0,
    "deviceCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" VARCHAR(500),
    "errorCode" VARCHAR(160),
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_installationId_key" ON "PushDevice"("installationId");

-- CreateIndex
CREATE INDEX "PushDevice_userId_isActive_lastSeenAt_idx" ON "PushDevice"("userId", "isActive", "lastSeenAt");

-- CreateIndex
CREATE INDEX "PushDevice_isActive_lastSeenAt_idx" ON "PushDevice"("isActive", "lastSeenAt");

-- CreateIndex
CREATE INDEX "NotificationCampaign_status_createdAt_idx" ON "NotificationCampaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationCampaign_createdById_createdAt_idx" ON "NotificationCampaign"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserNotification_userId_readAt_idx" ON "UserNotification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotification_campaignId_userId_key" ON "UserNotification"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_campaignId_status_idx" ON "NotificationDelivery"("campaignId", "status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_deviceId_status_idx" ON "NotificationDelivery"("deviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_campaignId_deviceId_key" ON "NotificationDelivery"("campaignId", "deviceId");

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
