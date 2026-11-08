-- AlterTable
ALTER TABLE "WhatsappContact" ADD COLUMN     "mauticContactId" INTEGER,
ADD COLUMN     "mauticError" TEXT,
ADD COLUMN     "mauticSyncedAt" TIMESTAMP(3),
ADD COLUMN     "mauticTags" TEXT,
ADD COLUMN     "mauticTriedAt" TIMESTAMP(3);
