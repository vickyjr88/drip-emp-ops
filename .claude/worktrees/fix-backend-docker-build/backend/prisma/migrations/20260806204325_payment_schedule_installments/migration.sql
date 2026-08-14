-- CreateTable
CREATE TABLE "PaymentScheduleInstallment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentScheduleInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentScheduleInstallment_contractId_idx" ON "PaymentScheduleInstallment"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentScheduleInstallment_contractId_sequence_key" ON "PaymentScheduleInstallment"("contractId", "sequence");

-- AddForeignKey
ALTER TABLE "PaymentScheduleInstallment" ADD CONSTRAINT "PaymentScheduleInstallment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
