-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "nationalIdPassport" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderPayment" ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "providerStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrderPayment_providerRef_key" ON "OrderPayment"("providerRef");

