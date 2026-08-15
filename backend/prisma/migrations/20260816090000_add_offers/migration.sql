-- Special offers, for clearing stock that is not moving.

CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

CREATE TABLE "Offer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT,
  "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
  "percentOff" DECIMAL(65,30),
  "fixedPriceKes" DECIMAL(65,30),
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Offer_status_idx" ON "Offer"("status");

CREATE TABLE "OfferLine" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "offerPriceKes" DECIMAL(65,30) NOT NULL,
  "wasPriceKes" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "OfferLine_pkey" PRIMARY KEY ("id")
);

-- One line per variant per offer: adding the same size twice is a mistake,
-- not a second markdown.
CREATE UNIQUE INDEX "OfferLine_offerId_variantId_key" ON "OfferLine"("offerId", "variantId");
CREATE INDEX "OfferLine_variantId_idx" ON "OfferLine"("variantId");

ALTER TABLE "OfferLine" ADD CONSTRAINT "OfferLine_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferLine" ADD CONSTRAINT "OfferLine_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
