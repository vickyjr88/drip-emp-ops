-- CreateEnum
CREATE TYPE "OrderLineFulfillmentType" AS ENUM ('STOCK', 'SUPPLIER_ORDER');

-- CreateEnum
CREATE TYPE "OrderLineFulfillmentStatus" AS ENUM ('AWAITING_SUPPLIER', 'ORDERED_FROM_SUPPLIER', 'RECEIVED', 'HANDED_TO_CUSTOMER');

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "fulfillmentStatus" "OrderLineFulfillmentStatus",
ADD COLUMN     "fulfillmentType" "OrderLineFulfillmentType" NOT NULL DEFAULT 'STOCK',
ADD COLUMN     "supplierInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "isDropShip" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "OrderLine_fulfillmentStatus_idx" ON "OrderLine"("fulfillmentStatus");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
