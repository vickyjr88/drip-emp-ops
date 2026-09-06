/*
  Warnings:

  - You are about to drop the column `kraPin` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `nationalIdPassport` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `nextOfKinJson` on the `Customer` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_brand_trgm_idx";

-- DropIndex
DROP INDEX "Product_name_trgm_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "kraPin",
DROP COLUMN "nationalIdPassport",
DROP COLUMN "nextOfKinJson";

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "author" TEXT NOT NULL DEFAULT 'Drip Emporium',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");
