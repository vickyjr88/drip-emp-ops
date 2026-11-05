-- AlterTable
ALTER TABLE "KitSettings" ADD COLUMN     "hiddenTemplates" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "KitTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "KitKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "aspect" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "areas" JSONB NOT NULL,
    "colours" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitTemplate_key_key" ON "KitTemplate"("key");

-- CreateIndex
CREATE INDEX "KitTemplate_kind_idx" ON "KitTemplate"("kind");

