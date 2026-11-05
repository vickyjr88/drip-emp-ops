-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('AWAITING_REVIEW', 'APPROVED', 'PRINTED', 'READY');

-- CreateEnum
CREATE TYPE "ProductLine" AS ENUM ('SHOP', 'KIT');

-- CreateEnum
CREATE TYPE "KitKind" AS ENUM ('JERSEY', 'TSHIRT');

-- CreateEnum
CREATE TYPE "KitEdition" AS ENUM ('HOME', 'AWAY', 'THIRD', 'RETRO', 'NONE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "line" "ProductLine" NOT NULL DEFAULT 'SHOP';

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "customisation" JSONB,
ADD COLUMN     "designId" TEXT,
ADD COLUMN     "printFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "printNotes" TEXT,
ADD COLUMN     "printStatus" "PrintStatus";

-- CreateTable
CREATE TABLE "KitClub" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "league" TEXT NOT NULL,
    "home" JSONB NOT NULL,
    "away" JSONB NOT NULL,
    "third" JSONB NOT NULL,
    "fontKeys" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitProduct" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "KitKind" NOT NULL,
    "clubId" TEXT,
    "season" TEXT,
    "edition" "KitEdition" NOT NULL DEFAULT 'NONE',
    "templateKey" TEXT NOT NULL,
    "colors" JSONB,
    "photoFront" TEXT,
    "photoBack" TEXT,
    "printAreas" JSONB,
    "allowName" BOOLEAN NOT NULL DEFAULT true,
    "allowNumber" BOOLEAN NOT NULL DEFAULT true,
    "allowArtwork" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitDesign" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "productSlug" TEXT,
    "spec" JSONB NOT NULL,
    "previewUrl" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitClub_slug_key" ON "KitClub"("slug");

-- CreateIndex
CREATE INDEX "KitClub_league_idx" ON "KitClub"("league");

-- CreateIndex
CREATE UNIQUE INDEX "KitProduct_productId_key" ON "KitProduct"("productId");

-- CreateIndex
CREATE INDEX "KitProduct_clubId_idx" ON "KitProduct"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "KitDesign_token_key" ON "KitDesign"("token");

-- CreateIndex
CREATE INDEX "KitDesign_productSlug_idx" ON "KitDesign"("productSlug");

-- CreateIndex
CREATE INDEX "Product_line_idx" ON "Product"("line");

-- CreateIndex
CREATE INDEX "OrderLine_printStatus_idx" ON "OrderLine"("printStatus");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_designId_fkey" FOREIGN KEY ("designId") REFERENCES "KitDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitProduct" ADD CONSTRAINT "KitProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitProduct" ADD CONSTRAINT "KitProduct_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "KitClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

