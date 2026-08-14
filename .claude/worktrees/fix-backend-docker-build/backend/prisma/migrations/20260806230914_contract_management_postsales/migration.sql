-- CreateEnum
CREATE TYPE "ContractAmendmentType" AS ENUM ('UNIT_TRANSFER', 'PRICE_CHANGE', 'OWNERSHIP_TRANSFER', 'CANCELLATION', 'MANUAL_EDIT');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultCancellationChargeRate" DECIMAL(65,30) NOT NULL DEFAULT 0.1;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "requestedBy" TEXT NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "SalesContract" ADD COLUMN     "cancellationCharge" DECIMAL(65,30),
ADD COLUMN     "cancellationChargeRate" DECIMAL(65,30),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "cancelledReason" TEXT;

-- CreateTable
CREATE TABLE "UnitTransfer" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromUnitId" TEXT NOT NULL,
    "toUnitId" TEXT NOT NULL,
    "fromPrice" DECIMAL(65,30) NOT NULL,
    "toPrice" DECIMAL(65,30) NOT NULL,
    "paidToDateAtTransfer" DECIMAL(65,30) NOT NULL,
    "refundId" TEXT,
    "reason" TEXT,
    "transferredBy" TEXT NOT NULL DEFAULT 'system',
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesContractAmendment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "ContractAmendmentType" NOT NULL,
    "fieldChanges" JSONB NOT NULL,
    "reason" TEXT,
    "amendedBy" TEXT NOT NULL DEFAULT 'system',
    "amendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesContractAmendment_contractId_idx" ON "SalesContractAmendment"("contractId");

-- AddForeignKey
ALTER TABLE "UnitTransfer" ADD CONSTRAINT "UnitTransfer_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitTransfer" ADD CONSTRAINT "UnitTransfer_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitTransfer" ADD CONSTRAINT "UnitTransfer_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesContractAmendment" ADD CONSTRAINT "SalesContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
