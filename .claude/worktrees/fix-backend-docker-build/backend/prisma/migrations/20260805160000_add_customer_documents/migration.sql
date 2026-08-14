-- CreateEnum
CREATE TYPE "CustomerDocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'KRA_PIN', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SALE_CONTRACT', 'LEASE_AGREEMENT', 'NEXT_OF_KIN_ID', 'PHOTO', 'OTHER');

-- CreateTable
CREATE TABLE "CustomerDocument" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentType" "CustomerDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSize" INTEGER,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
