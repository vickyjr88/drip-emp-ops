-- AlterTable
ALTER TABLE "CartLead" ADD COLUMN     "attributedCampaignId" TEXT,
ADD COLUMN     "referredByCustomerId" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppClick" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "resellerId" TEXT,
    "source" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppClick_campaignId_idx" ON "WhatsAppClick"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsAppClick_resellerId_idx" ON "WhatsAppClick"("resellerId");

-- CreateIndex
CREATE INDEX "CartLead_attributedCampaignId_idx" ON "CartLead"("attributedCampaignId");

-- CreateIndex
CREATE INDEX "CartLead_referredByCustomerId_idx" ON "CartLead"("referredByCustomerId");

-- AddForeignKey
ALTER TABLE "WhatsAppClick" ADD CONSTRAINT "WhatsAppClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppClick" ADD CONSTRAINT "WhatsAppClick_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLead" ADD CONSTRAINT "CartLead_attributedCampaignId_fkey" FOREIGN KEY ("attributedCampaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLead" ADD CONSTRAINT "CartLead_referredByCustomerId_fkey" FOREIGN KEY ("referredByCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
