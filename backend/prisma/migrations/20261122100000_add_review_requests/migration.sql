-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "emailStatus" TEXT,
    "emailDetail" TEXT,
    "emailAt" TIMESTAMP(3),
    "whatsappStatus" TEXT,
    "whatsappDetail" TEXT,
    "whatsappAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_orderId_key" ON "ReviewRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReviewRequest_phone_idx" ON "ReviewRequest"("phone");

-- CreateIndex
CREATE INDEX "ReviewRequest_email_idx" ON "ReviewRequest"("email");

-- CreateIndex
CREATE INDEX "ReviewRequest_nextAttemptAt_idx" ON "ReviewRequest"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
