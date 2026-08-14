-- CreateEnum
CREATE TYPE "OwnershipChangeAction" AS ENUM ('ASSIGNED', 'REASSIGNED', 'UPDATED', 'REMOVED');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RentalPaymentCategory" AS ENUM ('RENT', 'WATER', 'ELECTRICITY', 'GARBAGE', 'SECURITY', 'INTERNET', 'PARKING', 'SERVICE_CHARGE', 'OTHER');

-- CreateTable
CREATE TABLE "OwnershipChangeAudit" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ownershipId" TEXT,
    "action" "OwnershipChangeAction" NOT NULL,
    "fromCustomerId" TEXT,
    "toCustomerId" TEXT,
    "fromPercentage" DECIMAL(65,30),
    "toPercentage" DECIMAL(65,30),
    "fromIsPrimary" BOOLEAN,
    "toIsPrimary" BOOLEAN,
    "reason" TEXT,
    "changedBy" TEXT NOT NULL DEFAULT 'system',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipChangeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseStart" TIMESTAMP(3) NOT NULL,
    "leaseEnd" TIMESTAMP(3),
    "status" "TenancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthlyRent" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "depositAmount" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalPayment" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "category" "RentalPaymentCategory" NOT NULL,
    "amountPaid" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "transactionReference" TEXT NOT NULL,
    "billingPeriodStart" TIMESTAMP(3),
    "billingPeriodEnd" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "RentalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalPayment_receiptNumber_key" ON "RentalPayment"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RentalPayment_transactionReference_key" ON "RentalPayment"("transactionReference");

-- AddForeignKey
ALTER TABLE "OwnershipChangeAudit" ADD CONSTRAINT "OwnershipChangeAudit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipChangeAudit" ADD CONSTRAINT "OwnershipChangeAudit_fromCustomerId_fkey" FOREIGN KEY ("fromCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipChangeAudit" ADD CONSTRAINT "OwnershipChangeAudit_toCustomerId_fkey" FOREIGN KEY ("toCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
