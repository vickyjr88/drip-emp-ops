-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "attributedCampaignId" TEXT;

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignClick" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_code_key" ON "MarketingCampaign"("code");

-- CreateIndex
CREATE INDEX "MarketingCampaign_isActive_idx" ON "MarketingCampaign"("isActive");

-- CreateIndex
CREATE INDEX "CampaignClick_campaignId_idx" ON "CampaignClick"("campaignId");

-- CreateIndex
CREATE INDEX "Order_attributedCampaignId_idx" ON "Order"("attributedCampaignId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_attributedCampaignId_fkey" FOREIGN KEY ("attributedCampaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignClick" ADD CONSTRAINT "CampaignClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
