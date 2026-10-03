CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "phone" VARCHAR(24),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
ADD COLUMN "branchId" UUID,
ADD COLUMN "branchName" VARCHAR(160),
ADD COLUMN "branchAddress" VARCHAR(500),
ADD COLUMN "branchLatitude" DECIMAL(10,7),
ADD COLUMN "branchLongitude" DECIMAL(10,7),
ADD COLUMN "branchDistanceMeters" INTEGER;

CREATE INDEX "Branch_isActive_name_idx" ON "Branch"("isActive", "name");
CREATE INDEX "Order_branchId_status_createdAt_idx" ON "Order"("branchId", "status", "createdAt");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
