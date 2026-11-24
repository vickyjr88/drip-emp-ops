-- Automatic follow-up on leads and abandoned carts. Additive: new columns with defaults, one new enum, two EmailLog columns.
CREATE TYPE "CartLeadFollowUp" AS ENUM ('PENDING', 'DONE', 'FAILED', 'SKIPPED');

ALTER TABLE "CartLead"
  ADD COLUMN "followUpState" "CartLeadFollowUp" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "followUpReason" TEXT,
  ADD COLUMN "followUpNote" TEXT,
  ADD COLUMN "followUpAt" TIMESTAMP(3),
  ADD COLUMN "followUpBy" TEXT,
  ADD COLUMN "followUpAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "followUpNextAt" TIMESTAMP(3),
  ADD COLUMN "followUpClaimedAt" TIMESTAMP(3),
  ADD COLUMN "followUpWhatsapp" TEXT,
  ADD COLUMN "followUpWhatsappAt" TIMESTAMP(3),
  ADD COLUMN "followUpWhatsappMessageId" TEXT,
  ADD COLUMN "followUpEmail" TEXT,
  ADD COLUMN "followUpEmailAt" TIMESTAMP(3),
  ADD COLUMN "followUpEmailAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "CartLead_followUpState_lastActivityAt_idx" ON "CartLead"("followUpState", "lastActivityAt");

ALTER TABLE "EmailLog" ADD COLUMN "kind" TEXT, ADD COLUMN "cartLeadId" TEXT;
CREATE INDEX "EmailLog_cartLeadId_idx" ON "EmailLog"("cartLeadId");
CREATE INDEX "EmailLog_kind_recipient_sentAt_idx" ON "EmailLog"("kind", "recipient", "sentAt");

-- What is already known is recorded, so the first run does not repeat it:
-- the old 24-hour reminder email counts as an email already sent to that lead,
UPDATE "CartLead" SET "followUpEmail" = 'SENT', "followUpEmailAt" = "reminderSentAt" WHERE "reminderSentAt" IS NOT NULL;
-- and a lead that is already converted or dismissed needs no follow-up.
UPDATE "CartLead" SET "followUpState" = 'SKIPPED', "followUpReason" = 'CLOSED', "followUpNote" = CASE WHEN "status" = 'CONVERTED' THEN 'An order was placed' ELSE 'Dismissed by staff' END, "followUpAt" = now(), "followUpBy" = 'migration'
WHERE "status" IN ('CONVERTED', 'EXPIRED');
