-- CreateTable
CREATE TABLE "SocialSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "facebookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "times" TEXT[] DEFAULT ARRAY['09:00', '13:00', '19:00']::TEXT[],
    "cooldownDays" INTEGER NOT NULL DEFAULT 30,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "productSlug" TEXT,
    "caption" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "externalId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL DEFAULT 'schedule',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_channel_slotKey_key" ON "SocialPost"("channel", "slotKey");

-- CreateIndex
CREATE INDEX "SocialPost_channel_status_postedAt_idx" ON "SocialPost"("channel", "status", "postedAt");

-- CreateIndex
CREATE INDEX "SocialPost_productId_channel_status_idx" ON "SocialPost"("productId", "channel", "status");

-- CreateIndex
CREATE INDEX "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");
