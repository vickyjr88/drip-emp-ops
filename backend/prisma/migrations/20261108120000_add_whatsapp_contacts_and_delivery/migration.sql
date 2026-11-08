-- AlterTable
ALTER TABLE "DailyReportRun" ADD COLUMN     "delivery" TEXT,
ADD COLUMN     "deliveryError" TEXT,
ADD COLUMN     "messageId" TEXT;

-- AlterTable
ALTER TABLE "WhatsappOutreach" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "delivery" TEXT,
ADD COLUMN     "deliveryError" TEXT;

-- CreateTable
CREATE TABLE "WhatsappContact" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "adSourceId" TEXT,
    "adHeadline" TEXT,
    "adClickId" TEXT,
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedReason" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "noticeSentAt" TIMESTAMP(3),
    "nextStep" INTEGER NOT NULL DEFAULT 0,
    "nextStepAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessageStatus" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorTitle" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessageStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappContact_phone_key" ON "WhatsappContact"("phone");

-- CreateIndex
CREATE INDEX "WhatsappContact_subscribed_nextStepAt_idx" ON "WhatsappContact"("subscribed", "nextStepAt");

-- CreateIndex
CREATE INDEX "WhatsappContact_createdAt_idx" ON "WhatsappContact"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsappMessageStatus_messageId_idx" ON "WhatsappMessageStatus"("messageId");

-- CreateIndex
CREATE INDEX "WhatsappMessageStatus_createdAt_idx" ON "WhatsappMessageStatus"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessageStatus_messageId_status_key" ON "WhatsappMessageStatus"("messageId", "status");

-- CreateIndex
CREATE INDEX "DailyReportRun_messageId_idx" ON "DailyReportRun"("messageId");

-- CreateIndex
CREATE INDEX "WhatsappOutreach_messageId_idx" ON "WhatsappOutreach"("messageId");

-- CreateIndex
CREATE INDEX "WhatsappOutreach_phone_kind_idx" ON "WhatsappOutreach"("phone", "kind");

