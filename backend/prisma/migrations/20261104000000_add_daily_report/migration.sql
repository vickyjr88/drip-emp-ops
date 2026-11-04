-- CreateTable
CREATE TABLE "DailyReportSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "emailRecipients" TEXT[],
    "whatsappRecipients" TEXT[],
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportRun" (
    "id" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReportRun_reportDate_idx" ON "DailyReportRun"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportRun_reportDate_channel_recipient_key" ON "DailyReportRun"("reportDate", "channel", "recipient");
