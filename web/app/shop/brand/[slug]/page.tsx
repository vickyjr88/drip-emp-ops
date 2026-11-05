import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { CollectionPage, collectionMetadata } from '../../../components/collection-page';
import { buildCollections } from '../../../lib/collections';
import { fetchProducts } from '../../../lib/shop';
import { fetchWatchBrands, watchBrandPath } from '../../../lib/watches';

// Built from the live catalogue on every request, so prices, sizes and stock counts in the copy are always current.
export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const all = buildCollections(await fetchProducts());
  return { all, collection: all.find((c) => c.kind === 'brand' && c.slug === slug) };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { collection } = await load(params.slug);
  if (!collection) return { title: 'Not found', robots: { index: false, follow: true } };
  return collectionMetadata(collection);
}

export default async function Page({ params }: { params: { slug: string } }) {
  const { all, collection } = await load(params.slug);
  if (!collection) {
    // A watch brand's page moved with its watches.
    if ((await fetchWatchBrands()).some((b) => b.slug === params.slug)) permanentRedirect(watchBrandPath(params.slug));
    notFound();
  }
  return <CollectionPage collection={collection} all={all} />;
}
