-- DropForeignKey
ALTER TABLE "LoginAttempt" DROP CONSTRAINT "LoginAttempt_userId_fkey";

-- AlterTable
ALTER TABLE "ContactSettings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LoginAttempt" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ReceiptPrintSettings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
