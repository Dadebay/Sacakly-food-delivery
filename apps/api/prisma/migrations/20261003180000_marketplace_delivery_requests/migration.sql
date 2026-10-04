CREATE TYPE "MarketplaceDeliveryMode" AS ENUM ('OWN', 'NETWORK');
CREATE TYPE "MarketplaceDeliveryStatus" AS ENUM ('WAITING', 'OFFERED', 'CLAIMED', 'ASSIGNED', 'CANCELLED');
CREATE TABLE "MarketplaceDeliveryRequest" (
  "orderId" UUID NOT NULL,
  "cafeId" UUID NOT NULL,
  "mode" "MarketplaceDeliveryMode" NOT NULL,
  "status" "MarketplaceDeliveryStatus" NOT NULL DEFAULT 'WAITING',
  "courierId" UUID,
  "offerAt" TIMESTAMP(3) NOT NULL,
  "offeredAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceDeliveryRequest_pkey" PRIMARY KEY ("orderId")
);
CREATE INDEX "MarketplaceDeliveryRequest_status_offerAt_idx" ON "MarketplaceDeliveryRequest"("status", "offerAt");
CREATE INDEX "MarketplaceDeliveryRequest_cafeId_status_idx" ON "MarketplaceDeliveryRequest"("cafeId", "status");
CREATE INDEX "MarketplaceDeliveryRequest_courierId_status_idx" ON "MarketplaceDeliveryRequest"("courierId", "status");
ALTER TABLE "MarketplaceDeliveryRequest" ADD CONSTRAINT "MarketplaceDeliveryRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDeliveryRequest" ADD CONSTRAINT "MarketplaceDeliveryRequest_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDeliveryRequest" ADD CONSTRAINT "MarketplaceDeliveryRequest_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
