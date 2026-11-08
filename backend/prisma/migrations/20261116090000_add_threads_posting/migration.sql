-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "permalink" TEXT;

-- AlterTable
ALTER TABLE "SocialSetting" ADD COLUMN     "threadsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SocialCredential" (
    "channel" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "refreshedAt" TIMESTAMP(3),
    "sourceHash" TEXT,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialCredential_pkey" PRIMARY KEY ("channel")
);
