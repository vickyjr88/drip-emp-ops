-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "journalEntryId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "whtAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "whtRateId" TEXT;
