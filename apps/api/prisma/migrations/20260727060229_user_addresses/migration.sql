-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addressId" UUID;

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" VARCHAR(60),
    "address" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "entrance" VARCHAR(40),
    "floor" VARCHAR(20),
    "apartment" VARCHAR(20),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- Preserve distinct delivery addresses from existing orders. The most recently
-- used address becomes active for each customer.
WITH "addressGroups" AS (
    SELECT
        "customerId" AS "userId",
        "address",
        "latitude",
        "longitude",
        "entrance",
        "floor",
        "apartment",
        MIN("createdAt") AS "createdAt",
        MAX("createdAt") AS "lastUsedAt",
        MD5(CONCAT_WS(
            '|',
            "customerId"::text,
            "address",
            "latitude"::text,
            "longitude"::text,
            COALESCE("entrance", ''),
            COALESCE("floor", ''),
            COALESCE("apartment", '')
        ))::uuid AS "id"
    FROM "Order"
    GROUP BY
        "customerId",
        "address",
        "latitude",
        "longitude",
        "entrance",
        "floor",
        "apartment"
),
"rankedAddresses" AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY "userId"
            ORDER BY "lastUsedAt" DESC, "id" DESC
        ) AS "activeRank"
    FROM "addressGroups"
)
INSERT INTO "UserAddress" (
    "id",
    "userId",
    "address",
    "latitude",
    "longitude",
    "entrance",
    "floor",
    "apartment",
    "isActive",
    "lastUsedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    "address",
    "latitude",
    "longitude",
    "entrance",
    "floor",
    "apartment",
    "activeRank" = 1,
    "lastUsedAt",
    "createdAt",
    "lastUsedAt"
FROM "rankedAddresses";

UPDATE "Order"
SET "addressId" = MD5(CONCAT_WS(
    '|',
    "customerId"::text,
    "address",
    "latitude"::text,
    "longitude"::text,
    COALESCE("entrance", ''),
    COALESCE("floor", ''),
    COALESCE("apartment", '')
))::uuid;

-- CreateIndex
CREATE INDEX "UserAddress_userId_isActive_idx" ON "UserAddress"("userId", "isActive");

-- Database-level guarantee: a user can never have two active addresses.
CREATE UNIQUE INDEX "UserAddress_one_active_per_user"
ON "UserAddress"("userId")
WHERE "isActive" = true;

-- CreateIndex
CREATE INDEX "UserAddress_userId_lastUsedAt_createdAt_idx" ON "UserAddress"("userId", "lastUsedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Order_addressId_idx" ON "Order"("addressId");

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "UserAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
