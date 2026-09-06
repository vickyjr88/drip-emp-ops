import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../lib/site';
import { fetchProduct, formatKes } from '../../lib/shop';
import { ProductClient } from './product-client';

// Rendered per request so price and stock are never stale on the page a
// customer is about to message us about.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await fetchProduct(params.slug);
  // Deindexed explicitly rather than left to Next's 404 status alone: a
  // stale search-engine cache of this URL should not offer a "product not
  // found" page as a result.
  if (!product) return { title: 'Product not found', robots: { index: false, follow: true } };

  const description = `${product.name}${product.brand ? ` by ${product.brand}` : ''} — ${formatKes(product.priceFrom)}${
    product.sizesInStock.length ? `. In stock: ${product.sizesInStock.join(', ')}.` : '.'
  } Available at Drip Emporium, Ronald Ngala Street, Nairobi.`;
  // No fallback image for a product with none of its own: a card pointing at
  // a broken URL is worse than a card with no image, matching the fallback
  // rule preview-image.ts already applies to every other page.
  const shareImage = product.imageUrls[0];

  return {
    title: product.name,
    description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(shareImage ? { images: [{ url: shareImage }] } : {}),
    },
    twitter: {
      card: shareImage ? 'summary_large_image' : 'summary',
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(shareImage ? { images: [shareImage] } : {}),
    },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await fetchProduct(params.slug);
  if (!product) notFound();

  return (
    <>
      {/* Lets a search result show Home > Shop > Product instead of a bare
          URL, and gives an assistant the page's place in the site. */}
      <JsonLd
        data={{
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: absoluteUrl('/shop') },
            { '@type': 'ListItem', position: 3, name: product.name, item: absoluteUrl(`/shop/${product.slug}`) },
          ],
        }}
      />
      {/* Offer data so a search result can carry the price and whether it is
          in stock, which is most of what a shopper wants before clicking. */}
      <JsonLd
        data={{
          '@type': 'Product',
          name: product.name,
          ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
          ...(product.imageUrls.length ? { image: product.imageUrls } : {}),
          ...(product.description ? { description: product.description } : {}),
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'KES',
            lowPrice: product.priceFrom,
            highPrice: product.priceTo,
            offerCount: product.variants.length,
            availability: product.anyInStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: absoluteUrl(`/shop/${product.slug}`),
          },
        }}
      />
      <ProductClient product={product} />
    </>
  );
}
