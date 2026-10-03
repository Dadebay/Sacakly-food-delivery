CREATE TYPE "LoginAttemptStatus" AS ENUM ('REQUESTED', 'VERIFIED', 'FAILED', 'EXPIRED');
CREATE TABLE "LoginAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "phone" VARCHAR(24) NOT NULL,
  "installationId" VARCHAR(255), "deviceName" VARCHAR(160), "platform" "PushDevicePlatform",
  "appVersion" VARCHAR(40), "status" "LoginAttemptStatus" NOT NULL DEFAULT 'REQUESTED',
  "userId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "LoginAttempt_status_createdAt_idx" ON "LoginAttempt"("status", "createdAt");
CREATE INDEX "LoginAttempt_phone_createdAt_idx" ON "LoginAttempt"("phone", "createdAt");
