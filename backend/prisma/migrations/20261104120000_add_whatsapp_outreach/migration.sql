-- CreateTable
CREATE TABLE "WhatsappOutreach" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "messageId" TEXT,
    "error" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappOutreach_customerId_kind_idx" ON "WhatsappOutreach"("customerId", "kind");

-- CreateIndex
CREATE INDEX "WhatsappOutreach_createdAt_idx" ON "WhatsappOutreach"("createdAt");

-- AddForeignKey
ALTER TABLE "WhatsappOutreach" ADD CONSTRAINT "WhatsappOutreach_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
