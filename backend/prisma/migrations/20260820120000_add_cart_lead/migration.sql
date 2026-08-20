-- CreateEnum
CREATE TYPE "CartLeadSource" AS ENUM ('WHATSAPP_ORDER', 'ABANDONED_CART');

-- CreateEnum
CREATE TYPE "CartLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CartLead" (
    "id" TEXT NOT NULL,
    "source" "CartLeadSource" NOT NULL,
    "status" "CartLeadStatus" NOT NULL DEFAULT 'NEW',
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "shippingAddress" TEXT,
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "shipping" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "message" TEXT,
    "orderId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartLead_orderId_key" ON "CartLead"("orderId");

-- CreateIndex
CREATE INDEX "CartLead_customerId_idx" ON "CartLead"("customerId");

-- CreateIndex
CREATE INDEX "CartLead_source_idx" ON "CartLead"("source");

-- CreateIndex
CREATE INDEX "CartLead_status_idx" ON "CartLead"("status");

-- AddForeignKey
ALTER TABLE "CartLead" ADD CONSTRAINT "CartLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLead" ADD CONSTRAINT "CartLead_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
