-- New orders start in COOKING. Legacy intake stages collapse into COOKING,
-- while COMPLETED collapses into CASH_RETURNED before the enum is replaced.
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "OrderStatus_new" AS ENUM (
  'COOKING',
  'READY',
  'ASSIGNED_TO_COURIER',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CASH_RETURNED',
  'RECONCILED',
  'CANCELLED'
);

ALTER TABLE "Order"
ALTER COLUMN "status" TYPE "OrderStatus_new"
USING (
  CASE "status"::text
    WHEN 'NEW' THEN 'COOKING'
    WHEN 'CONFIRMED' THEN 'COOKING'
    WHEN 'SENT_TO_KITCHEN' THEN 'COOKING'
    WHEN 'COMPLETED' THEN 'CASH_RETURNED'
    ELSE "status"::text
  END
)::"OrderStatus_new";

ALTER TABLE "OrderTransition"
ALTER COLUMN "fromStatus" TYPE "OrderStatus_new"
USING (
  CASE "fromStatus"::text
    WHEN 'NEW' THEN 'COOKING'
    WHEN 'CONFIRMED' THEN 'COOKING'
    WHEN 'SENT_TO_KITCHEN' THEN 'COOKING'
    WHEN 'COMPLETED' THEN 'CASH_RETURNED'
    ELSE "fromStatus"::text
  END
)::"OrderStatus_new";

ALTER TABLE "OrderTransition"
ALTER COLUMN "toStatus" TYPE "OrderStatus_new"
USING (
  CASE "toStatus"::text
    WHEN 'NEW' THEN 'COOKING'
    WHEN 'CONFIRMED' THEN 'COOKING'
    WHEN 'SENT_TO_KITCHEN' THEN 'COOKING'
    WHEN 'COMPLETED' THEN 'CASH_RETURNED'
    ELSE "toStatus"::text
  END
)::"OrderStatus_new";

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'COOKING';

UPDATE "Order"
SET "completedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'CASH_RETURNED';

UPDATE "CashSettlement"
SET
  "status" = 'CONFIRMED',
  "operatorTakenAt" = COALESCE("operatorTakenAt", "courierGivenAt")
WHERE "status" = 'RECORDED';
