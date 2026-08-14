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
  if (!product) return { title: 'Product not found' };

  const description = `${product.name}${product.brand ? ` by ${product.brand}` : ''} — ${formatKes(product.priceFrom)}${
    product.sizesInStock.length ? `. In stock: ${product.sizesInStock.join(', ')}.` : '.'
  } Available at Drip Emporium, Ronald Ngala Street, Nairobi.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(product.imageUrls[0] ? { images: [{ url: product.imageUrls[0] }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await fetchProduct(params.slug);
  if (!product) notFound();

  return (
    <>
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
