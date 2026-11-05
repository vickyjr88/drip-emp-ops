/** Small server-rendered pieces shared by the Watches pages. */

import Image from 'next/image';
import Link from 'next/link';
import { priceLabel } from '../lib/shop';
import { watchBrandPath, watchPath, brandSlug, type WatchBrand, type WatchProduct } from '../lib/watches';

export function WatchCard({ watch }: { watch: WatchProduct }) {
  const photo = watch.imageUrls[0];
  return (
    <article className={`de-card wt-card${watch.anyInStock ? '' : ' is-preorder'}`}>
      <Link href={watchPath(watch.slug)} className="de-card-media">
        {photo ? (
          <Image src={photo} alt={watch.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" style={{ objectFit: 'cover' }} />
        ) : (
          <span className="de-card-placeholder" aria-hidden="true">{watch.name.charAt(0)}</span>
        )}
        {!watch.anyInStock ? <span className="de-card-flag is-preorder">Available to order</span> : null}
      </Link>
      <div className="de-card-body">
        {watch.brand ? <p className="de-card-brand">{watch.brand}</p> : null}
        <h3><Link href={watchPath(watch.slug)}>{watch.name}</Link></h3>
        <p className="de-card-price">{priceLabel(watch as any)}</p>
        <Link href={watchPath(watch.slug)} className="lp-button wt-view">View watch</Link>
      </div>
    </article>
  );
}

/** Every brand with a page: a plain list of links, so a crawler (and a person) can reach each one. */
export function BrandDirectory({ brands, heading = 'Shop by brand' }: { brands: WatchBrand[]; heading?: string }) {
  if (!brands.length) return null;
  return (
    <section className="lp-container kt-directory" aria-labelledby="wt-brands-heading">
      <h2 id="wt-brands-heading">{heading}</h2>
      <ul className="kt-chip-list">
        {brands.map((b) => (
          <li key={b.slug}><Link href={watchBrandPath(b.slug)}>{b.name} ({b.count})</Link></li>
        ))}
      </ul>
    </section>
  );
}

export { brandSlug };
