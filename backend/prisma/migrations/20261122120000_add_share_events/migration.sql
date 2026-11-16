-- CreateTable
CREATE TABLE "ShareEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "productSlug" TEXT,
    "withCode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareEvent_customerId_createdAt_idx" ON "ShareEvent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ShareEvent_createdAt_idx" ON "ShareEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ShareEvent_productSlug_idx" ON "ShareEvent"("productSlug");

-- AddForeignKey
ALTER TABLE "ShareEvent" ADD CONSTRAINT "ShareEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
