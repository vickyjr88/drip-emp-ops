"use client";

/**
 * A watch's page. There is no size anywhere: a watch is one thing, or it comes in a few named versions (a strap or dial
 * colour), and only then is there anything to choose.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { FaqList } from '../../components/kit-parts';
import { WatchCard } from '../../components/watch-parts';
import { ShareButton } from '../../components/share-button';
import { useCart } from '../../lib/cart';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';
import { absoluteUrl } from '../../lib/site';
import { formatKes, priceLabel } from '../../lib/shop';
import { brandSlug, watchBrandPath, watchPath, type WatchProduct } from '../../lib/watches';
import type { FaqItem } from '../../lib/kit-seo';
import { trackAddToCart as trackMetaAddToCart } from '../../lib/meta-pixel';
import { trackAddToCart as trackXAddToCart } from '../../lib/x-pixel';
import { trackAddToCart as trackTikTokAddToCart } from '../../lib/tiktok-pixel';

export function WatchClient({ watch, faqs }: { watch: WatchProduct; faqs: FaqItem[] }) {
  const cart = useCart();
  const enquiry = useEnquiryContact();
  const [image, setImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(watch.variants.find((v) => v.inStock)?.id ?? watch.variants[0]?.id ?? null);
  const chosen = watch.variants.find((v) => v.id === variantId) ?? null;
  const choice = watch.options.length > 1 && chosen ? chosen.name : '';

  const message = [
    'Hello Drip Emporium, I would like to order:',
    '',
    `Item:  ${watch.name}${watch.brand ? ` (${watch.brand})` : ''}`,
    ...(choice ? [`Option: ${choice}`] : []),
    ...(chosen ? [`SKU:   ${chosen.sku}`, `Price: ${formatKes(chosen.priceKes)}`] : []),
    ...(typeof window !== 'undefined' ? ['', `Link: ${window.location.origin}${watchPath(watch.slug)}`] : []),
  ].join('\n');

  return (
    <EliteLayout active="watches">
      <main className="lp-main-content de-product wt-page">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/watches">Watches</Link>
          {watch.brand ? <><span aria-hidden="true">/</span><Link href={watchBrandPath(brandSlug(watch.brand))}>{watch.brand}</Link></> : null}
        </nav>

        <section className="lp-container de-product-main">
          <div className="de-gallery">
            <div className="de-gallery-main">
              {watch.imageUrls[image] ? (
                <Image src={watch.imageUrls[image]} alt={watch.name} fill sizes="(max-width: 768px) 100vw, 500px" style={{ objectFit: 'cover' }} priority />
              ) : (
                <span className="de-gallery-placeholder" aria-hidden="true">{watch.name.charAt(0)}</span>
              )}
            </div>
            {watch.imageUrls.length > 1 ? (
              <div className="de-gallery-thumbs">
                {watch.imageUrls.map((url, index) => (
                  <button key={url} type="button" className={index === image ? 'is-on' : undefined} onClick={() => setImage(index)} aria-label={`View image ${index + 1}`}>
                    <Image src={url} alt="" fill sizes="66px" style={{ objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="de-product-info">
            <div className="de-product-title-row">
              <div className="de-product-title-row-left">
                {watch.brand ? <p className="de-product-brand"><Link href={watchBrandPath(brandSlug(watch.brand))}>{watch.brand}</Link></p> : null}
              </div>
              <div className="de-product-title-row-actions">
                <ShareButton url={absoluteUrl(watchPath(watch.slug))} title={watch.name} text={`${watch.name}${watch.brand ? ` by ${watch.brand}` : ''} — ${priceLabel(watch as any)}`} />
              </div>
            </div>
            <h1>{watch.name}</h1>
            <p className="de-product-price">{chosen ? formatKes(chosen.priceKes) : priceLabel(watch as any)}</p>

            {watch.options.length > 1 ? (
              <div className="de-sizes">
                <div className="de-sizes-head"><span>Choose one</span></div>
                <div className="de-size-buttons">
                  {watch.variants.map((v) => (
                    <button key={v.id} type="button" className={`de-size wt-option${variantId === v.id ? ' is-on' : ''}${v.inStock ? '' : ' is-preorder'}`} onClick={() => setVariantId(v.id)}>
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="de-size-note">{watch.anyInStock ? 'In stock' : 'Available to order'}{chosen ? ` · ${chosen.sku}` : ''}</p>

            <div className="de-actions">
              <button
                type="button"
                className="lp-button lp-button-primary"
                disabled={!chosen}
                onClick={() => {
                  if (!chosen) return;
                  cart.add({ variantId: chosen.id, productSlug: watch.slug, name: watch.name, size: choice, sku: chosen.sku, priceKes: chosen.priceKes, imageUrl: watch.imageUrls[0] || null, path: watchPath(watch.slug) });
                  const track = { contentId: watch.id, contentName: watch.name, value: chosen.priceKes };
                  trackMetaAddToCart(track); trackXAddToCart(track); trackTikTokAddToCart(track);
                  setAdded(true);
                  window.setTimeout(() => setAdded(false), 2500);
                }}
              >
                {added ? 'Added ✓' : 'Add to cart'}
              </button>
              {cart.count > 0 ? <Link href="/cart" className="lp-button de-checkout-btn">Checkout ({cart.count} item{cart.count === 1 ? '' : 's'})</Link> : null}
              <a className="lp-button de-whatsapp" href={enquiry.whatsappHref(message)} onClick={() => enquiry.onWhatsAppClick('watch-page')} target="_blank" rel="noreferrer">Or order on WhatsApp</a>
              <a className="lp-button lp-button-ghost" href={enquiry.phoneHref}>Call {enquiry.phone}</a>
            </div>

            <ul className="de-assurances">
              <li>{enquiry.deliveryNote}</li>
              <li>See it in person at Dubai Merchants Mall, Ronald Ngala Street</li>
              <li>Open 08:00–20:00, every day</li>
            </ul>
            {watch.description ? <div className="de-product-copy"><p>{watch.description}</p></div> : null}
          </div>
        </section>

        {watch.related?.length ? (
          <section className="lp-container de-related">
            <h2>More watches</h2>
            <div className="de-grid">{watch.related.map((w) => <WatchCard key={w.id} watch={w} />)}</div>
          </section>
        ) : null}
        <FaqList faqs={faqs} />
      </main>
    </EliteLayout>
  );
}
