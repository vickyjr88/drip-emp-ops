-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "referralCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "referredByCustomerId" TEXT;

-- CreateIndex
CREATE INDEX "Order_referredByCustomerId_idx" ON "Order"("referredByCustomerId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_referredByCustomerId_fkey" FOREIGN KEY ("referredByCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
