-- CreateTable
CREATE TABLE "CustomerMerge" (
    "id" TEXT NOT NULL,
    "keptCustomerId" TEXT NOT NULL,
    "mergedCustomerId" TEXT NOT NULL,
    "mergedSnapshot" JSONB NOT NULL,
    "moved" JSONB NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerMerge_keptCustomerId_idx" ON "CustomerMerge"("keptCustomerId");

-- CreateIndex
CREATE INDEX "CustomerMerge_mergedCustomerId_idx" ON "CustomerMerge"("mergedCustomerId");
