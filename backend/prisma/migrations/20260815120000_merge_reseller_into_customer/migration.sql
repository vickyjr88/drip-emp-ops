-- Resellers and wholesalers become customers.
--
-- They were a separate table, so a competing shop that also bought a pair for
-- itself existed twice and could not sign in to either record. A reseller is a
-- customer on a different price list, so the tier moves onto Customer and the
-- table goes.

ALTER TABLE "Customer"
  ADD COLUMN "priceTier" "PriceTier" NOT NULL DEFAULT 'RETAIL',
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "resetTokenHash" TEXT,
  ADD COLUMN "resetTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- Carry every reseller across.
--
-- Email is the login and must be unique, but a reseller was not required to
-- have one. Rather than drop those rows, a placeholder is derived from the
-- trade code; it cannot receive mail, and portalEnabled stays false, so the
-- account is inert until someone sets a real address. Matching on an existing
-- email instead upgrades that customer's tier rather than creating a twin.
INSERT INTO "Customer" (
  "id", "firstName", "lastName", "email", "phone", "priceTier", "businessName",
  "code", "location", "creditLimit", "isActive", "notes", "portalEnabled", "createdAt"
)
SELECT
  r."id",
  r."name",
  '',
  COALESCE(NULLIF(TRIM(LOWER(r."email")), ''), LOWER(r."code") || '@trade.invalid'),
  COALESCE(r."phone", ''),
  r."priceTier",
  r."name",
  r."code",
  r."location",
  r."creditLimit",
  r."isActive",
  r."notes",
  false,
  r."createdAt"
FROM "Reseller" r
WHERE NOT EXISTS (
  SELECT 1 FROM "Customer" c WHERE LOWER(c."email") = TRIM(LOWER(r."email"))
);

-- A reseller whose email already belonged to a customer: upgrade that record
-- rather than duplicating the person.
UPDATE "Customer" c
SET "priceTier" = r."priceTier",
    "businessName" = r."name",
    "code" = r."code",
    "location" = r."location",
    "creditLimit" = r."creditLimit",
    "notes" = r."notes"
FROM "Reseller" r
WHERE LOWER(c."email") = TRIM(LOWER(r."email"))
  AND c."id" <> r."id";

-- Repoint consignments. Where the reseller merged into an existing customer,
-- follow the email to that customer's id.
ALTER TABLE "Consignment" ADD COLUMN "customerId" TEXT;

UPDATE "Consignment" con
SET "customerId" = COALESCE(
  (SELECT c."id" FROM "Customer" c WHERE c."id" = con."resellerId"),
  (SELECT c2."id" FROM "Customer" c2
     JOIN "Reseller" r2 ON LOWER(c2."email") = TRIM(LOWER(r2."email"))
    WHERE r2."id" = con."resellerId" LIMIT 1)
);

-- Any consignment that could not be repointed would break the shop's record of
-- what is out with whom, so the migration stops rather than losing it.
DO $$
DECLARE orphaned INT;
BEGIN
  SELECT COUNT(*) INTO orphaned FROM "Consignment" WHERE "customerId" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: % consignment(s) have no matching customer', orphaned;
  END IF;
END $$;

ALTER TABLE "Consignment" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Consignment" DROP CONSTRAINT IF EXISTS "Consignment_resellerId_fkey";
DROP INDEX IF EXISTS "Consignment_resellerId_idx";
ALTER TABLE "Consignment" DROP COLUMN "resellerId";

ALTER TABLE "Consignment"
  ADD CONSTRAINT "Consignment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Consignment_customerId_idx" ON "Consignment"("customerId");

DROP TABLE "Reseller";
