-- AlterTable
ALTER TABLE "CartLead" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "StorefrontEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productSlug" TEXT,
    "detail" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "device" TEXT,
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "amountKes" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorefrontEvent_createdAt_idx" ON "StorefrontEvent"("createdAt");

-- CreateIndex
CREATE INDEX "StorefrontEvent_type_createdAt_idx" ON "StorefrontEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontEvent_sessionId_idx" ON "StorefrontEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AdSpend_day_idx" ON "AdSpend"("day");

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");

