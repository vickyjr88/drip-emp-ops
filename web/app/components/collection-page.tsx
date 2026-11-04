import type { Metadata } from 'next';
import Link from 'next/link';
import { EliteLayout } from './elite-layout';
import { ProductCard } from './product-card';
import { JsonLd, SITE_NAME, absoluteUrl } from '../lib/site';
import { sharePreviewUrl, brandPreviewImage } from '../lib/preview-image';
import {
  collectionDescription, collectionFaqs, collectionHeading, collectionIntro, collectionPath, collectionTitle, isIndexable,
  type Collection,
} from '../lib/collections';

/** Title, description, canonical and share card for a brand or model page. */
export async function collectionMetadata(collection: Collection): Promise<Metadata> {
  const heading = collectionHeading(collection);
  const title = collectionTitle(collection);
  const description = collectionDescription(collection);
  const path = collectionPath(collection);
  const image = collection.products.find((p) => p.imageUrls[0])?.imageUrls[0] ?? (await brandPreviewImage());

  return {
    title,
    description,
    alternates: { canonical: path },
    // A one- or two-product page is thin; it stays reachable (the product page links to it) but out of the index.
    ...(isIndexable(collection) ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      ...(image ? { images: [{ url: sharePreviewUrl(image), width: 1200, height: 630, type: 'image/jpeg' }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: `${title} | ${SITE_NAME}`,
      description,
      ...(image ? { images: [sharePreviewUrl(image)] } : {}),
    },
  };
}

/**
 * The page itself: a plain, fully server-rendered answer (price range, where to buy, delivery) above the product grid,
 * with the questions shoppers ask below it, visible and marked up as FAQPage. Written for people first; it is also
 * the shape search engines and AI assistants quote from.
 */
export function CollectionPage({ collection, all }: { collection: Collection; all: Collection[] }) {
  const heading = collectionHeading(collection);
  const faqs = collectionFaqs(collection);
  const path = collectionPath(collection);

  // Where to go next: the other collections worth a visit, and the categories these products sit in.
  const others = all.filter((c) => isIndexable(c) && !(c.kind === collection.kind && c.slug === collection.slug)).slice(0, 12);
  const categories = Array.from(
    new Map(collection.products.filter((p) => p.category).map((p) => [p.category!.slug, p.category!.name])).entries(),
  );

  return (
    <>
      <JsonLd
        data={{
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: absoluteUrl('/shop') },
            { '@type': 'ListItem', position: 3, name: heading, item: absoluteUrl(path) },
          ],
        }}
      />
      <JsonLd
        data={{
          '@type': 'CollectionPage',
          '@id': `${absoluteUrl(path)}#collection`,
          name: heading,
          url: absoluteUrl(path),
          description: collectionDescription(collection),
          isPartOf: { '@id': `${absoluteUrl('/')}#website` },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: collection.products.length,
            itemListElement: collection.products.slice(0, 50).map((product, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: absoluteUrl(`/shop/${product.slug}`),
              name: product.name,
            })),
          },
        }}
      />
      {/* Same words as the visible FAQ below: marked-up questions must match what the page shows. */}
      <JsonLd
        data={{
          '@type': 'FAQPage',
          '@id': `${absoluteUrl(path)}#faq`,
          mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }}
      />

      <EliteLayout active="shop">
        <main className="lp-main-content de-shop">
          <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / <Link href="/shop">Shop</Link> / <span>{heading}</span>
          </nav>
          <section className="lp-container de-shop-head">
            <h1>{heading}</h1>
            <p>{collectionIntro(collection)}</p>
            {collection.blurb ? <p>{collection.blurb}</p> : null}
          </section>

          <section className="lp-container de-grid-wrap" aria-label={`${collection.name} products`}>
            <div className="de-grid">
              {collection.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>

          <section className="lp-container de-category-copy de-collection-faq">
            <h2>Frequently asked questions</h2>
            {faqs.map((faq) => (
              <div key={faq.question}>
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </div>
            ))}
          </section>

          {others.length > 0 || categories.length > 0 ? (
            <section className="lp-container de-category-copy de-collection-links">
              <h2>Keep browsing</h2>
              <p>
                {categories.map(([slug, name]) => (
                  <Link key={slug} href={`/shop/category/${slug}`}>{name}</Link>
                ))}
                {others.map((other) => (
                  <Link key={`${other.kind}-${other.slug}`} href={collectionPath(other)}>
                    {other.name}
                  </Link>
                ))}
              </p>
            </section>
          ) : null}
        </main>
      </EliteLayout>
    </>
  );
}
