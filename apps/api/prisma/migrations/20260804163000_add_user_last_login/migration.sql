ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE INDEX "User_lastLoginAt_idx" ON "User"("lastLoginAt");
