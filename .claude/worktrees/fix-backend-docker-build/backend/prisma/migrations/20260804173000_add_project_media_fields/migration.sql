-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "description" TEXT,
ADD COLUMN "featuredImageUrl" TEXT,
ADD COLUMN "galleryImages" JSONB;