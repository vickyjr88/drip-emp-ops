"use client";

/**
 * A kit's page: what it looks like (front and back), the size, the price, and the two ways forward: personalise it in
 * the design center, or buy it as it is. A shopper who wants a name and number on it never has to leave the shirt they
 * were looking at: "Personalise" opens the design center with this exact shirt loaded.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { FanVersionNote, FaqList, KitArt, KitCard } from '../../components/kit-parts';
import { useCart } from '../../lib/cart';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';
import { formatKes, priceLabel } from '../../lib/shop';
import { EDITION_LABELS, clubPath, designLink, leagueByKey, leaguePath, type KitConfig, type KitProduct } from '../../lib/kits';
import type { FaqItem } from '../../lib/kit-seo';

export function KitClient({ product, config, faqs }: { product: KitProduct; config: KitConfig; faqs: FaqItem[] }) {
  const cart = useCart();
  const enquiry = useEnquiryContact();
  const [sizeId, setSizeId] = useState<string | null>(product.variants.find((v) => v.size === 'M')?.id ?? product.variants.find((v) => v.inStock)?.id ?? product.variants[0]?.id ?? null);
  const [view, setView] = useState<'photo' | 'front' | 'back'>(product.imageUrls[0] ? 'photo' : 'front');
  const [added, setAdded] = useState(false);
  const chosen = product.variants.find((v) => v.id === sizeId) ?? null;
  const { kit } = product;
  const league = kit.club ? leagueByKey(kit.club.league) : undefined;
  const canPersonalise = kit.allowName || kit.allowNumber || kit.allowArtwork;
  const edition = EDITION_LABELS[kit.edition];

  const message = [
    'Hello Drip Emporium, I would like to order:',
    '',
    `Item:  ${product.name}`,
    ...(chosen ? [`Size:  ${chosen.size ?? chosen.name}`, `SKU:   ${chosen.sku}`, `Price: ${formatKes(chosen.priceKes)}`] : []),
    ...(typeof window !== 'undefined' ? ['', `Link: ${window.location.origin}/kits/${product.slug}`] : []),
  ].join('\n');

  return (
    <EliteLayout active="kits">
      <main className="lp-main-content de-product kt-page">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/kits">Kits</Link>
          {league ? <><span aria-hidden="true">/</span><Link href={leaguePath(league.slug)}>{league.name}</Link></> : null}
          {kit.club ? <><span aria-hidden="true">/</span><Link href={clubPath(kit.club.slug)}>{kit.club.name}</Link></> : null}
        </nav>

        <section className="lp-container de-product-main">
          <div className="de-gallery">
            <div className="de-gallery-main kt-gallery-main">
              {view === 'photo' && product.imageUrls[0] ? (
                <Image src={product.imageUrls[0]} alt={product.name} fill sizes="(max-width: 768px) 100vw, 500px" style={{ objectFit: 'cover' }} priority />
              ) : (
                <KitArt product={product} side={view === 'back' ? 'back' : 'front'} className="kt-gallery-art" />
              )}
            </div>
            <div className="de-gallery-thumbs">
              {product.imageUrls[0] ? <button type="button" className={view === 'photo' ? 'is-on' : undefined} onClick={() => setView('photo')} aria-label="Photo"><Image src={product.imageUrls[0]} alt="" fill sizes="66px" style={{ objectFit: 'cover' }} /></button> : null}
              <button type="button" className={view === 'front' ? 'is-on kt-thumb' : 'kt-thumb'} onClick={() => setView('front')} aria-label="Front view"><KitArt product={product} side="front" /></button>
              <button type="button" className={view === 'back' ? 'is-on kt-thumb' : 'kt-thumb'} onClick={() => setView('back')} aria-label="Back view"><KitArt product={product} side="back" /></button>
            </div>
          </div>

          <div className="de-product-info">
            <p className="de-product-brand">{kit.club ? <Link href={clubPath(kit.club.slug)}>{kit.club.name}</Link> : 'Custom T-shirt'}{edition ? ` · ${edition}` : ''}{kit.season ? ` · ${kit.season}` : ''}</p>
            <h1>{product.name}</h1>
            <p className="de-product-price">{chosen ? formatKes(chosen.priceKes) : priceLabel(product)}</p>

            {canPersonalise ? (
              <div className="kt-personalise-box">
                <p><strong>Make it yours.</strong> {kit.allowName || kit.allowNumber ? 'Add your name and number' : 'Add your own text or artwork'}, pick the lettering and preview the {kit.kind === 'JERSEY' ? 'back of the shirt' : 'shirt'} before you order.</p>
                <p className="kt-fee">
                  {kit.allowName && kit.allowNumber
                    ? `Name and number from ${formatKes(config.pricing.nameAndNumberFeeKes)}`
                    : kit.allowName
                      ? `Name from ${formatKes(config.pricing.nameFeeKes)}`
                      : `Artwork from ${formatKes(config.pricing.artworkFeeKes)}`}
                </p>
                <Link href={designLink(product.slug)} className="lp-button lp-button-primary">Personalise this shirt</Link>
              </div>
            ) : null}

            <div className="de-sizes">
              <div className="de-sizes-head"><span>Select size</span>{!product.anyInStock ? <em>Made to order</em> : null}</div>
              <div className="de-size-buttons">
                {product.variants.map((variant) => (
                  <button key={variant.id} type="button" className={`de-size${sizeId === variant.id ? ' is-on' : ''}${variant.inStock ? '' : ' is-preorder'}`} onClick={() => setSizeId(variant.id)} aria-label={`${variant.size ?? variant.name}${variant.inStock ? '' : ', made to order'}`}>
                    {variant.size ?? variant.name}
                  </button>
                ))}
              </div>
              {chosen ? <p className="de-size-note">{chosen.size ?? chosen.name} · {chosen.sku} · {chosen.inStock ? 'in stock' : 'made to order'}</p> : null}
            </div>

            <div className="de-actions">
              <button
                type="button"
                className="lp-button"
                disabled={!chosen}
                onClick={() => {
                  if (!chosen) return;
                  cart.add({ variantId: chosen.id, productSlug: product.slug, name: product.name, size: chosen.size ?? chosen.name, sku: chosen.sku, priceKes: chosen.priceKes, imageUrl: product.imageUrls[0] || null, path: `/kits/${product.slug}` });
                  setAdded(true);
                  window.setTimeout(() => setAdded(false), 2500);
                }}
              >
                {added ? 'Added ✓' : chosen ? `Add ${chosen.size ?? chosen.name} to cart, no print` : 'Select a size'}
              </button>
              {cart.count > 0 ? <Link href="/cart" className="lp-button de-checkout-btn">Checkout ({cart.count} item{cart.count === 1 ? '' : 's'})</Link> : null}
              <a className="lp-button de-whatsapp" href={enquiry.whatsappHref(message)} onClick={() => enquiry.onWhatsAppClick('kit-page')} target="_blank" rel="noreferrer">Or order on WhatsApp</a>
            </div>

            <ul className="de-assurances">
              <li>{config.leadTime}</li>
              <li>{enquiry.deliveryNote}</li>
              <li>Collect at Dubai Merchants Mall, Ronald Ngala Street</li>
            </ul>
            {product.description ? <div className="de-product-copy"><p>{product.description}</p></div> : null}
            <FanVersionNote text={config.fanVersionNote} />
          </div>
        </section>

        {product.related?.length ? (
          <section className="lp-container de-related">
            <h2>More {kit.club ? kit.club.name : 'kits'}</h2>
            <div className="de-grid">{product.related.map((item) => <KitCard key={item.id} product={item} />)}</div>
          </section>
        ) : null}
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
