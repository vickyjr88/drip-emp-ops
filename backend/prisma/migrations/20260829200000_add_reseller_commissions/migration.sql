-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('ACCRUED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResellerPayoutStatus" AS ENUM ('STAGED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "accruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalEntryId" TEXT,
    "payoutId" TEXT,
    "reversalJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerPayout" (
    "id" TEXT NOT NULL,
    "payoutNumber" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "ResellerPayoutStatus" NOT NULL DEFAULT 'STAGED',
    "stagedBy" TEXT,
    "stagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "journalEntryId" TEXT,

    CONSTRAINT "ResellerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Commission_orderId_key" ON "Commission"("orderId");

-- CreateIndex
CREATE INDEX "Commission_resellerId_idx" ON "Commission"("resellerId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerPayout_payoutNumber_key" ON "ResellerPayout"("payoutNumber");

-- CreateIndex
CREATE INDEX "ResellerPayout_resellerId_idx" ON "ResellerPayout"("resellerId");

-- CreateIndex
CREATE INDEX "ResellerPayout_status_idx" ON "ResellerPayout"("status");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ResellerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerPayout" ADD CONSTRAINT "ResellerPayout_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
