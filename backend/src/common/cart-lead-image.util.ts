import { PrismaService } from '../prisma/prisma.service';

/**
 * A cart lead's line snapshot has no image of its own -- it's a stored copy
 * of what was in the cart, not a live relation (see RecordCartLeadDto) --
 * so a thumbnail is resolved here, at read time, from the first line's
 * variantId. One batched query per page/list rather than one per lead.
 *
 * Shared by CartLeadService (the lead worklist/history) and the campaign
 * and reseller performance views, which both surface the same WhatsApp
 * leads filtered down to their own attribution -- pulled out rather than
 * duplicated three times or reached into CartLeadService's own private
 * method from another module.
 */
export async function withFirstLineImage<T extends { lines: unknown }>(
  prisma: Pick<PrismaService, 'productVariant'>,
  leads: T[],
): Promise<Array<T & { firstLineImageUrl: string | null }>> {
  const firstVariantIds = leads
    .map((lead) => (lead.lines as Array<{ variantId?: string }>)?.[0]?.variantId)
    .filter((id): id is string => Boolean(id));

  const variants = firstVariantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: firstVariantIds } },
        select: { id: true, product: { select: { featuredImageUrl: true, imageUrls: true } } },
      })
    : [];
  const imageByVariantId = new Map(
    variants.map((variant) => {
      const imageUrls = Array.isArray(variant.product.imageUrls) ? (variant.product.imageUrls as string[]) : [];
      return [variant.id, variant.product.featuredImageUrl || imageUrls[0] || null];
    }),
  );

  return leads.map((lead) => {
    const firstVariantId = (lead.lines as Array<{ variantId?: string }>)?.[0]?.variantId;
    return { ...lead, firstLineImageUrl: (firstVariantId && imageByVariantId.get(firstVariantId)) || null };
  });
}
