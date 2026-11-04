import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd, SITE_NAME, absoluteUrl, productFaqSchema } from '../../lib/site';
import { fetchProduct, formatKes, priceLabel } from '../../lib/shop';
import { sharePreviewUrl } from '../../lib/preview-image';
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

  // Shoppers search "<product> price in Kenya"; the title says so and carries the price, and the description says
  // what the pair is, whether it is on the shelf, and where to get it.
  const price = priceLabel(product);
  const description = `${product.name}${product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase()) ? ` by ${product.brand}` : ''}: ${price} in Kenya. ${
    product.sizesInStock.length
      ? `In stock in ${product.sizesInStock.join(', ')}.`
      : 'Not on the shelf right now: message us on WhatsApp to order yours.'
  } Buy at Drip Emporium, Dubai Merchants Mall, Ronald Ngala Street, Nairobi, or order with delivery across Kenya.`;
  // No fallback image for a product with none of its own: a card pointing at
  // a broken URL is worse than a card with no image, matching the fallback
  // rule preview-image.ts already applies to every other page.
  const shareImage = product.imageUrls[0];

  return {
    title: `${product.name} Price in Kenya: ${price}`,
    description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(shareImage ? { images: [{ url: sharePreviewUrl(shareImage), width: 1200, height: 630, type: 'image/jpeg' }] } : {}),
    },
    twitter: {
      card: shareImage ? 'summary_large_image' : 'summary',
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(shareImage ? { images: [sharePreviewUrl(shareImage)] } : {}),
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
          '@id': `${absoluteUrl(`/shop/${product.slug}`)}#product`,
          url: absoluteUrl(`/shop/${product.slug}`),
          name: product.name,
          // Every pair is sold new, and the first size's SKU identifies the model for shopping feeds.
          ...(product.variants[0]?.sku ? { sku: product.variants[0].sku } : {}),
          ...(product.category?.name ? { category: product.category.name } : {}),
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
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@id': `${absoluteUrl('/')}#organization` },
          },
        }}
      />
      {/* Delivery, visiting the shop, authenticity and sizing -- the same
          questions on every product, answered against this one specifically
          so an AI engine citing this page has the fact attached to it. */}
      <JsonLd data={productFaqSchema(product)} />
      <ProductClient product={product} />
    </>
  );
}
