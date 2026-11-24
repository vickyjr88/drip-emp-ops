-- Social posting grows from Facebook and Threads to Instagram, X and TikTok. Each is switched on separately and off by default.
ALTER TABLE "SocialSetting"
  ADD COLUMN "instagramEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "xEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tiktokMode" TEXT NOT NULL DEFAULT 'INBOX';

-- TikTok logins are connected from the portal and renewed by the app: the refresh token rotates on every use.
ALTER TABLE "SocialCredential"
  ADD COLUMN "refreshToken" TEXT,
  ADD COLUMN "refreshExpiresAt" TIMESTAMP(3),
  ADD COLUMN "username" TEXT;
