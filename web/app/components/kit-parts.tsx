/**
 * Small server-rendered pieces shared by the Kits pages: the product card, the notice every page carries, the visible
 * questions (the same text is marked up as FAQPage by the page), and the lists of clubs and leagues that link the
 * pages together.
 */

import Image from 'next/image';
import Link from 'next/link';
import { KitShirt, areasFor, areasFromFractions } from './kit-shirt';
import { formatKes, priceLabel } from '../lib/shop';
import {
  EDITION_LABELS, LEAGUES, clubPath, designLink, kitPath, leaguePath, type KitClub, type KitProduct,
} from '../lib/kits';
import type { FaqItem } from '../lib/kit-seo';

export function KitArt({ product, side = 'front', className }: { product: KitProduct; side?: 'front' | 'back'; className?: string }) {
  const { kit } = product;
  const photo = side === 'back' ? kit.photoBack : kit.photoFront;
  return (
    <KitShirt
      className={className}
      templateKey={kit.templateKey}
      colors={kit.colors}
      side={side}
      photo={photo}
      photoAspect={kit.photoAspect}
      // Areas marked on a photo are fractions of it; a drawn shirt uses its own.
      areas={photo ? areasFromFractions(kit.printAreas, kit.photoAspect, kit.kind) : areasFor(kit.templateKey)}
      title={`${product.name}, ${side} view`}
    />
  );
}

export function KitCard({ product }: { product: KitProduct }) {
  const photo = product.imageUrls[0];
  const edition = EDITION_LABELS[product.kit.edition];
  return (
    <article className={`de-card kt-card${product.anyInStock ? '' : ' is-preorder'}`}>
      <Link href={kitPath(product.slug)} className="de-card-media kt-card-media">
        {photo ? (
          <Image src={photo} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" style={{ objectFit: 'cover' }} />
        ) : (
          <KitArt product={product} className="kt-card-art" />
        )}
        {product.kit.kind === 'JERSEY' && product.kit.allowName ? <span className="de-card-flag is-featured">Add your name</span> : null}
      </Link>
      <div className="de-card-body">
        {product.kit.club ? <p className="de-card-brand">{product.kit.club.name}{edition ? ` · ${edition}` : ''}</p> : <p className="de-card-brand">Custom T-shirt</p>}
        <h3><Link href={kitPath(product.slug)}>{product.name}</Link></h3>
        <p className="de-card-price">{priceLabel(product)}</p>
        {product.sizesInStock.length ? <p className="de-card-sizes"><em>{product.sizesInStock.join(' · ')}</em></p> : <p className="de-card-sizes is-preorder">Made to order</p>}
        <Link href={designLink(product.slug)} className="lp-button lp-button-primary kt-personalise">Personalise</Link>
      </div>
    </article>
  );
}

export function FanVersionNote({ text }: { text?: string }) {
  return (
    <p className="kt-note">
      {text || 'Fan-version shirts in club colours. Independent product, not endorsed by or affiliated with any club, league or kit maker.'}
    </p>
  );
}

export function FaqList({ faqs, heading = 'Questions people ask' }: { faqs: FaqItem[]; heading?: string }) {
  return (
    <section className="lp-container kt-faq" aria-labelledby="kt-faq-heading">
      <h2 id="kt-faq-heading">{heading}</h2>
      <dl>
        {faqs.map((faq) => (
          <div key={faq.question}>
            <dt>{faq.question}</dt>
            <dd>{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Every league and club that has a page: a plain list of links, which is what lets a crawler (and a person) reach each one. */
export function ClubDirectory({ clubs, heading = 'Shop by club' }: { clubs: KitClub[]; heading?: string }) {
  const groups = LEAGUES.map((league) => ({ league, clubs: clubs.filter((c) => c.league === league.key) })).filter((g) => g.clubs.length);
  if (!groups.length) return null;
  return (
    <section className="lp-container kt-directory" aria-labelledby="kt-directory-heading">
      <h2 id="kt-directory-heading">{heading}</h2>
      {groups.map(({ league, clubs: list }) => (
        <div key={league.key} className="kt-directory-group">
          <h3><Link href={leaguePath(league.slug)}>{league.name}</Link></h3>
          <ul>
            {list.map((club) => (
              <li key={club.slug}><Link href={clubPath(club.slug)}>{club.name}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function PriceFrom({ product }: { product: KitProduct }) {
  return <>{product.priceFrom > 0 ? `from ${formatKes(product.priceFrom)}` : 'Price on request'}</>;
}
