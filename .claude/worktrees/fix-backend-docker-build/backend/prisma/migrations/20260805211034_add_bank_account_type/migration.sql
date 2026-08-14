-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('BANK', 'MOBILE_MONEY');

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "type" "BankAccountType" NOT NULL DEFAULT 'BANK';
