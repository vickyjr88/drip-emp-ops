-- CreateTable
CREATE TABLE "AlertSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "emailRecipients" TEXT[],
    "whatsappRecipients" TEXT[],
    "whatsappTemplate" TEXT,
    "dailyWhatsAppCap" INTEGER NOT NULL DEFAULT 80,
    "kinds" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "subject" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "link" TEXT,
    "followUpUrl" TEXT,
    "results" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAlert_createdAt_idx" ON "AdminAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAlert_kind_dedupeKey_key" ON "AdminAlert"("kind", "dedupeKey");
