-- CreateEnum
CREATE TYPE "ResellerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ResellerApplication" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ResellerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResellerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResellerApplication_status_idx" ON "ResellerApplication"("status");

-- CreateIndex
CREATE INDEX "ResellerApplication_customerId_idx" ON "ResellerApplication"("customerId");

-- AddForeignKey
ALTER TABLE "ResellerApplication" ADD CONSTRAINT "ResellerApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
