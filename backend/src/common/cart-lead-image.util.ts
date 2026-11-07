import { PrismaService } from '../prisma/prisma.service';
import { productPath } from './follow-up';

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
): Promise<Array<Omit<T, 'lines'> & { lines: Array<Record<string, unknown> & { variantId?: string; path: string | null }>; firstLineImageUrl: string | null }>> {
  // Every line's product is looked up, not just the first: the image is the first line's, but each line also gets the page
  // its product lives at, so a follow-up message can link to everything in the cart.
  const variantIds = leads
    .flatMap((lead) => (lead.lines as Array<{ variantId?: string }>) ?? [])
    .map((line) => line.variantId)
    .filter((id): id is string => Boolean(id));

  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, product: { select: { slug: true, line: true, featuredImageUrl: true, imageUrls: true } } },
      })
    : [];
  const pathByVariantId = new Map(variants.map((variant) => [variant.id, productPath(variant.product)]));
  const imageByVariantId = new Map(
    variants.map((variant) => {
      const imageUrls = Array.isArray(variant.product.imageUrls) ? (variant.product.imageUrls as string[]) : [];
      return [variant.id, variant.product.featuredImageUrl || imageUrls[0] || null];
    }),
  );

  return leads.map((lead) => {
    const lines = ((lead.lines as Array<Record<string, unknown> & { variantId?: string }>) ?? []).map((line) => ({
      ...line,
      path: (line.variantId && pathByVariantId.get(line.variantId)) || null,
    }));
    const firstVariantId = lines[0]?.variantId;
    return { ...lead, lines, firstLineImageUrl: (firstVariantId && imageByVariantId.get(firstVariantId)) || null };
  });
}

/**
 * The same resolution as {@link withFirstLineImage}, but for every line on
 * one lead rather than just the first -- used by the lead detail view,
 * which shows each item's own picture rather than a single representative
 * thumbnail for the whole cart.
 */
export async function withLineImages<T extends { lines: unknown }>(
  prisma: Pick<PrismaService, 'productVariant'>,
  lead: T,
): Promise<Omit<T, 'lines'> & { lines: Array<Record<string, unknown> & { imageUrl: string | null; path: string | null }> }> {
  const lines = (lead.lines as Array<Record<string, unknown> & { variantId?: string }>) || [];
  const variantIds = lines.map((line) => line.variantId).filter((id): id is string => Boolean(id));

  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, product: { select: { slug: true, line: true, featuredImageUrl: true, imageUrls: true } } },
      })
    : [];
  const imageByVariantId = new Map(
    variants.map((variant) => {
      const imageUrls = Array.isArray(variant.product.imageUrls) ? (variant.product.imageUrls as string[]) : [];
      return [variant.id, variant.product.featuredImageUrl || imageUrls[0] || null];
    }),
  );
  const pathByVariantId = new Map(variants.map((variant) => [variant.id, productPath(variant.product)]));

  return {
    ...lead,
    lines: lines.map((line) => ({
      ...line,
      imageUrl: (line.variantId && imageByVariantId.get(line.variantId)) || null,
      path: (line.variantId && pathByVariantId.get(line.variantId)) || null,
    })),
  };
}
