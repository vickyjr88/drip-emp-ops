-- CreateEnum
CREATE TYPE "ConstructionStage" AS ENUM ('PLANNING', 'FOUNDATION', 'STRUCTURE', 'ROOFING', 'FINISHING', 'HANDOVER');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('PASSED', 'FAILED', 'NEEDS_FOLLOW_UP');

-- CreateTable
CREATE TABLE "ConstructionStatus" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "currentStage" "ConstructionStage" NOT NULL DEFAULT 'PLANNING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "ConstructionStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionStageLog" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "stage" "ConstructionStage" NOT NULL,
    "progressPercent" INTEGER NOT NULL,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "ConstructionStageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePhoto" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "stage" "ConstructionStage",
    "url" TEXT NOT NULL,
    "objectKey" TEXT,
    "caption" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInspection" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "stage" "ConstructionStage" NOT NULL,
    "inspectorName" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "outcome" "InspectionOutcome" NOT NULL,
    "findings" TEXT,
    "photoUrls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "SiteInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionStatus_blockId_key" ON "ConstructionStatus"("blockId");

-- AddForeignKey
ALTER TABLE "ConstructionStatus" ADD CONSTRAINT "ConstructionStatus_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ProjectBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionStageLog" ADD CONSTRAINT "ConstructionStageLog_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ProjectBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ProjectBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspection" ADD CONSTRAINT "SiteInspection_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ProjectBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
