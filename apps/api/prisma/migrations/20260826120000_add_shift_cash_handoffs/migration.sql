CREATE TYPE "CashHandoffStatus" AS ENUM ('SUBMITTED', 'CONFIRMED');

CREATE TABLE "AccountingSettings" (
    "id" VARCHAR(40) NOT NULL DEFAULT 'default',
    "firstShiftName" VARCHAR(80) NOT NULL DEFAULT 'Дневная смена',
    "firstShiftStartMinutes" INTEGER NOT NULL DEFAULT 570,
    "secondShiftName" VARCHAR(80) NOT NULL DEFAULT 'Ночная смена',
    "secondShiftStartMinutes" INTEGER NOT NULL DEFAULT 1140,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashHandoff" (
    "id" UUID NOT NULL,
    "shiftKey" VARCHAR(40) NOT NULL,
    "shiftName" VARCHAR(80) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "submittedById" UUID NOT NULL,
    "confirmedById" UUID,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "declaredAmount" DECIMAL(12,2) NOT NULL,
    "settlementCount" INTEGER NOT NULL,
    "status" "CashHandoffStatus" NOT NULL DEFAULT 'SUBMITTED',
    "note" VARCHAR(500),
    "confirmationNote" VARCHAR(500),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    CONSTRAINT "CashHandoff_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CashSettlement" ADD COLUMN "cashHandoffId" UUID;

CREATE UNIQUE INDEX "CashHandoff_shiftKey_key" ON "CashHandoff"("shiftKey");
CREATE INDEX "CashHandoff_status_periodEnd_idx" ON "CashHandoff"("status", "periodEnd");
CREATE INDEX "CashHandoff_periodStart_periodEnd_idx" ON "CashHandoff"("periodStart", "periodEnd");
CREATE INDEX "CashSettlement_operatorTakenAt_status_idx" ON "CashSettlement"("operatorTakenAt", "status");
CREATE INDEX "CashSettlement_cashHandoffId_idx" ON "CashSettlement"("cashHandoffId");

ALTER TABLE "CashHandoff" ADD CONSTRAINT "CashHandoff_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashHandoff" ADD CONSTRAINT "CashHandoff_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSettlement" ADD CONSTRAINT "CashSettlement_cashHandoffId_fkey" FOREIGN KEY ("cashHandoffId") REFERENCES "CashHandoff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
