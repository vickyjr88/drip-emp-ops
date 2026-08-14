/*
  Warnings:

  - You are about to drop the column `refundId` on the `UnitTransfer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UnitTransfer" DROP COLUMN "refundId",
ADD COLUMN     "excessAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
