-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('RETAIL', 'RESELLER', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "ConsignmentStatus" AS ENUM ('OPEN', 'SETTLED', 'WRITTEN_OFF');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'CONSIGNMENT_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'CONSIGNMENT_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'CONSIGNMENT_SOLD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "priceTier" "PriceTier" NOT NULL DEFAULT 'RETAIL';

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "listPrice" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "resellerPriceKes" DECIMAL(65,30),
ADD COLUMN     "wholesalePriceKes" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "StockLevel" ADD COLUMN     "onConsignment" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "priceTier" "PriceTier" NOT NULL DEFAULT 'RESELLER',
    "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consignment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "ConsignmentStatus" NOT NULL DEFAULT 'OPEN',
    "priceTier" "PriceTier" NOT NULL DEFAULT 'RESELLER',
    "totalValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "soldValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "Consignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentLine" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantityOut" INTEGER NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ConsignmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentPayment" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT NOT NULL DEFAULT 'system',
    "journalEntryId" TEXT,

    CONSTRAINT "ConsignmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_code_key" ON "Reseller"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Consignment_reference_key" ON "Consignment"("reference");

-- CreateIndex
CREATE INDEX "Consignment_resellerId_idx" ON "Consignment"("resellerId");

-- CreateIndex
CREATE INDEX "Consignment_status_idx" ON "Consignment"("status");

-- CreateIndex
CREATE INDEX "ConsignmentLine_consignmentId_idx" ON "ConsignmentLine"("consignmentId");

-- CreateIndex
CREATE INDEX "ConsignmentPayment_consignmentId_idx" ON "ConsignmentPayment"("consignmentId");

-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentLine" ADD CONSTRAINT "ConsignmentLine_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentLine" ADD CONSTRAINT "ConsignmentLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentPayment" ADD CONSTRAINT "ConsignmentPayment_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

