"use client";

/**
 * One product tile, shared by the shop grid and the home page's featured
 * section so a shopper gets the same share and quick-add controls wherever a
 * card appears rather than a stripped-down version on one page.
 *
 * A card has no room for a full size grid, so "Add to Cart" opens a small
 * popover of in-stock sizes instead of jumping to the product page -- most
 * shoppers already know their size, and re-deciding it on every card they
 * scroll past would undo the point of a quick add.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ShareButton } from './share-button';
import { useCart } from '../lib/cart';
import { useCustomerAuth } from '../lib/customer-auth';
import { absoluteUrl } from '../lib/site';
import { withReferral } from '../lib/referral';
import { ShopProduct, priceLabel, formatKes } from '../lib/shop';

/**
 * "36–44" from a list of sizes, or a single size when only one is left.
 *
 * Sorted numerically because "EUR 39" sorts before "EUR 7" as text, and a
 * range built from a text sort would be wrong.
 */
function sizeRange(sizes: string[]) {
  const numbers = sizes
    .map((size) => parseInt(size.replace(/\D/g, ''), 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!numbers.length) return '';
  const low = numbers[0];
  const high = numbers[numbers.length - 1];
  return low === high ? String(low) : `${low}–${high}`;
}

export function ProductCard({ product }: { product: ShopProduct }) {
  const cart = useCart();
  const auth = useCustomerAuth();
  const [pickingSize, setPickingSize] = useState(false);
  const [added, setAdded] = useState(false);
  const productUrl = absoluteUrl(`/shop/${product.slug}`);
  const shareUrl = withReferral(productUrl, auth.customer);

  function addSize(variant: ShopProduct['variants'][number]) {
    cart.add({
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      // Falls back to the variant's own name for a sizeless product (a
      // watch, a perfume) -- the cart line still needs some label, and
      // that's exactly what the variant name is for.
      size: variant.size ?? variant.name,
      sku: variant.sku,
      priceKes: variant.priceKes,
      imageUrl: product.imageUrls[0] || null,
    });
    setPickingSize(false);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  }

  const orderableVariants = product.variants.filter((variant) => variant.canOrder);

  return (
    <article className={`de-card${product.anyInStock ? '' : ' is-preorder'}`}>
      <Link href={`/shop/${product.slug}`} className="de-card-media">
        {product.imageUrls[0] ? (
          <Image
            src={product.imageUrls[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <span className="de-card-placeholder" aria-hidden="true">
            {product.name.charAt(0)}
          </span>
        )}
        {product.isFeatured ? (
          <span className="de-card-flag is-featured">Featured</span>
        ) : null}
        {!product.anyInStock && orderableVariants.length ? (
          <span className="de-card-flag is-preorder">Ships from supplier</span>
        ) : null}
      </Link>

      <div className="de-card-overlay-actions">
        <ShareButton
          compact
          url={shareUrl}
          title={product.name}
          text={`${product.name}${product.brand ? ` by ${product.brand}` : ''} — ${priceLabel(product)}`}
        />
      </div>

      <div className="de-card-body">
        {product.brand ? <p className="de-card-brand">{product.brand}</p> : null}
        <h3><Link href={`/shop/${product.slug}`}>{product.name}</Link></h3>
        <p className="de-card-price">
          {priceLabel(product)}
          {/* The badge earns its place only when something is
              actually cheaper, so it never becomes wallpaper. */}
          {product.onOffer ? (
            <span className="de-offer-badge">{product.offerLabel || 'Offer'}</span>
          ) : null}
        </p>
        {/* Only present for a logged-in reseller/wholesale viewer -- retail
            shoppers and guests never see this line. */}
        {product.retailPriceFrom ? (
          <p className="de-reseller-price">
            Retail <s>{formatKes(product.retailPriceFrom)}</s> · you keep{' '}
            {formatKes(product.retailPriceFrom - product.priceFrom)}
          </p>
        ) : null}

        {/* A range rather than every size: a full 36-46 run would be
            eleven chips per card and unreadable at a glance. The
            product page carries the exact grid. Omitted entirely for a
            sizeless category (Watches, Perfumes) that is actually in
            stock -- anyInStock is the real availability signal there,
            since sizesInStock is empty by design, not because nothing
            is available. */}
        {product.sizesInStock.length ? (
          <p className="de-card-sizes">
            <span>EUR</span>
            <em>{sizeRange(product.sizesInStock)}</em>
            {product.sizesInStock.length > 1 ? (
              <small>{product.sizesInStock.length} sizes</small>
            ) : null}
          </p>
        ) : product.anyInStock ? null : orderableVariants.length ? (
          <p className="de-card-sizes is-preorder">Ordered in from supplier</p>
        ) : (
          <p className="de-card-sizes is-none">Out of stock — ask us</p>
        )}

        {orderableVariants.length ? (
          <div className="de-card-quickadd">
            {pickingSize ? (
              <div className="de-card-size-picker">
                <div className="de-card-size-picker-head">
                  <span>Select size</span>
                  <button type="button" onClick={() => setPickingSize(false)} aria-label="Cancel">×</button>
                </div>
                <div className="de-card-size-picker-grid">
                  {orderableVariants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      className="de-chip"
                      onClick={() => addSize(variant)}
                    >
                      {(variant.size ?? variant.name).replace('EUR ', '')}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="lp-button lp-button-ghost de-card-add-btn"
                // A single orderable variant (a watch, a perfume, or a shoe
                // down to its last size) has nothing to pick -- add it
                // straight away instead of opening a picker with one chip
                // in it.
                onClick={() =>
                  orderableVariants.length === 1 ? addSize(orderableVariants[0]) : setPickingSize(true)
                }
              >
                {added ? 'Added ✓' : 'Add to Cart'}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
