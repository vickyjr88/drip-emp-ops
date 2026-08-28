import { PriceTier, Prisma } from '@prisma/client';

/**
 * What a given tier pays for a variant, falling back up the tiers when a
 * price is unset: WHOLESALE falls back to RESELLER then RETAIL, RESELLER
 * falls back to RETAIL. The one price-resolution rule the shop has, used
 * wherever a tier actually pays for something -- a staff-created order, a
 * consignment issue, or a tier-aware storefront checkout.
 */
export function priceForTier(
  variant: { priceKes: Prisma.Decimal; resellerPriceKes: Prisma.Decimal | null; wholesalePriceKes: Prisma.Decimal | null },
  tier: PriceTier,
): number {
  if (tier === 'WHOLESALE') {
    return Number(variant.wholesalePriceKes ?? variant.resellerPriceKes ?? variant.priceKes);
  }
  if (tier === 'RESELLER') {
    return Number(variant.resellerPriceKes ?? variant.priceKes);
  }
  return Number(variant.priceKes);
}
