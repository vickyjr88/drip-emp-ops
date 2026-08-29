-- CreateTable
CREATE TABLE "ReferralClick" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralClick_resellerId_idx" ON "ReferralClick"("resellerId");

-- AddForeignKey
ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
