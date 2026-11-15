"use client";

/**
 * Product page.
 *
 * The whole page is arranged around one question — do you have my size — and
 * one action: message the shop about it. Sizes are buttons rather than a
 * dropdown, and a size that is out is visibly out rather than a disappointment
 * waiting inside a menu. Choosing a size builds a WhatsApp message that names
 * the product, the SKU and the size, so the shop can answer without a
 * back-and-forth about which black Air Force the customer means.
 *
 * Two ways to buy, deliberately. Card checkout for someone who wants to pay
 * now, and WhatsApp for the trade that already happens there — most of this
 * shop's customers message before they buy, and burying that behind a cart
 * would cost more than the cart gains.
 *
 * On a phone the buttons used to sit a screen below the price, so a visitor
 * who had decided still had to scroll to act on it. A buy bar now stays at the
 * bottom of the screen (Add to Cart, WhatsApp, Call) whenever the real buttons
 * are out of view, and the reasons to trust the shop sit beside the price
 * rather than under the buttons.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { ProductCard } from '../../components/product-card';
import { ShareButton } from '../../components/share-button';
import { PhoneIcon, WhatsAppIcon } from '../../components/contact-icons';
import { ProductReviewsSection } from '../../components/product-reviews';
import { Stars } from '../../components/stars';
import { FavoriteButton } from '../../components/favorite-button';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';
import { useCart } from '../../lib/cart';
import { useCustomerAuth } from '../../lib/customer-auth';
import { absoluteUrl } from '../../lib/site';
import { slugify } from '../../lib/collections';
import { withReferral } from '../../lib/referral';
import { useCaptureReferral } from '../../lib/use-capture-referral';
import { trackAddToCart as trackMetaAddToCart, trackViewContent as trackMetaViewContent } from '../../lib/meta-pixel';
import { trackAddToCart as trackXAddToCart, trackViewContent as trackXViewContent } from '../../lib/x-pixel';
import { trackAddToCart as trackTikTokAddToCart, trackViewContent as trackTikTokViewContent } from '../../lib/tiktok-pixel';
import { ShopProduct, fetchProduct, formatKes, priceLabel } from '../../lib/shop';

export function ProductClient({ product: initialProduct }: { product: ShopProduct }) {
  const enquiry = useEnquiryContact();
  const cart = useCart();
  const auth = useCustomerAuth();
  const [added, setAdded] = useState(false);
  // The buy bar shows while the real buttons are out of view (below the fold on arrival, above it once scrolled past).
  const actionsRef = useRef<HTMLDivElement>(null);
  const [barOn, setBarOn] = useState(false);

  // Every possible landing point for a shared referral link is this page --
  // ShareButton only ever links to a product page -- so capturing happens
  // here, not in a layout.
  useCaptureReferral();

  // The server render has no access to the customer's token (it lives in
  // localStorage), so it always renders at retail. A logged-in reseller's
  // tier price arrives a moment later once this re-fetches with their token.
  const [product, setProduct] = useState(initialProduct);
  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.token) {
      // Signed out (or never signed in): the server-rendered retail data is
      // already correct, and re-fetching without a token would just repeat
      // the same request for nothing.
      setProduct(initialProduct);
      return;
    }
    let cancelled = false;
    void fetchProduct(initialProduct.slug, auth.token).then((fresh) => {
      if (!cancelled && fresh) setProduct(fresh);
    });
    return () => { cancelled = true; };
  }, [auth.ready, auth.token, initialProduct]);
  const [sizeId, setSizeId] = useState<string | null>(
    // A discounted size wins the default. Otherwise a shopper landing on a
    // product with a clearance badge would see the full price until they
    // happened to click the one size that is actually reduced.
    () =>
      product.variants.find((variant) => variant.inStock && variant.wasPriceKes)?.id ??
      product.variants.find((variant) => variant.inStock)?.id ??
      // Nothing on the shelf: fall back to any orderable size rather than
      // leaving the page with nothing picked, since it can still be sourced
      // from the supplier.
      product.variants.find((variant) => variant.canOrder)?.id ??
      null,
  );
  const [image, setImage] = useState(0);
  // For a shopper whose size isn't among the ones listed at all (not just
  // out of stock) -- typed in and sent along with the WhatsApp enquiry
  // rather than silently dropped, since the size buttons have nothing for
  // a size the product doesn't carry.
  const [manualSize, setManualSize] = useState('');

  const chosen = product.variants.find((variant) => variant.id === sizeId) || null;

  // Once per product landing, not per size tap -- a ViewContent means "saw
  // this listing," and re-firing it every time someone tries a different
  // size would inflate it far past actual page views.
  useEffect(() => {
    trackMetaViewContent({
      contentId: product.id,
      contentName: product.name,
      value: product.priceFrom,
    });
    trackXViewContent({
      contentId: product.id,
      contentName: product.name,
      value: product.priceFrom,
    });
    trackTikTokViewContent({
      contentId: product.id,
      contentName: product.name,
      value: product.priceFrom,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    const element = actionsRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    // The bottom margin is the bar's own height: it stays until the real buttons have risen clear of it, so they are never half behind it.
    const observer = new IntersectionObserver(([entry]) => setBarOn(!entry.isIntersecting), { threshold: 0, rootMargin: '0px 0px -84px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Lets the page's own floating buttons step aside while the buy bar holds the same actions (see globals.css).
  useEffect(() => {
    document.body.classList.toggle('has-buybar', barOn);
    return () => document.body.classList.remove('has-buybar');
  }, [barOn]);

  /**
   * The enquiry, as a message someone can act on without asking twice.
   *
   * It used to be a single line naming the shoe and the size. That reads
   * fine, but the shop then has to ask who is writing and which listing they
   * mean -- so the item is spelled out on its own lines, the page is linked,
   * and a signed-in customer's own details ride along. Nothing is invented
   * for a visitor who is not signed in: the shop just gets the item.
   */
  function buildEnquiry() {
    const lines: string[] = [];

    if (chosen) {
      lines.push('Hello Drip Emporium, I would like to order:');
      lines.push('');
      lines.push(`Item:  ${product.name}${product.brand ? ` (${product.brand})` : ''}`);
      // Omitted entirely for a sizeless product (a watch, a perfume) --
      // there is nothing to confirm, and "Size: null" would only confuse
      // whoever reads the message on the other end.
      if (chosen.size) lines.push(`Size:  ${chosen.size}`);
      lines.push(`SKU:   ${chosen.sku}`);
      lines.push(`Price: ${formatKes(chosen.priceKes)}`);
      // Saying it is out of stock up front stops the shop replying "yes" to
      // something that needs a supplier order first.
      if (!chosen.inStock) lines.push('(Available to Order — usual lead time applies)');
    } else {
      lines.push(`Hello Drip Emporium, I am interested in the ${product.name}.`);
      lines.push('');
      lines.push('What sizes do you have?');
    }

    if (manualSize.trim()) {
      lines.push(`Size needed (not listed): ${manualSize.trim()}`);
    }

    if (typeof window !== 'undefined') {
      lines.push('');
      lines.push(`Link: ${window.location.origin}/shop/${product.slug}`);
    }

    // Only for a signed-in customer, and never the password: WhatsApp messages
    // get forwarded and backed up.
    if (auth.customer) {
      lines.push('');
      lines.push(`Name:  ${`${auth.customer.firstName} ${auth.customer.lastName}`.trim()}`);
      lines.push(`Email: ${auth.customer.email}`);
      if (auth.customer.phone) lines.push(`Phone: ${auth.customer.phone}`);
      if (auth.customer.priceTier && auth.customer.priceTier !== 'RETAIL') {
        lines.push(`Account: ${auth.customer.priceTier} price list`);
      }
    }

    return lines.join('\n');
  }

  const message = buildEnquiry();

  /** Adds the chosen size to the cart. The page's button and the buy bar's both do exactly this. */
  function addChosen() {
    if (!chosen) return;
    const label = `${product.name} - ${chosen.size ?? chosen.name}`;
    cart.add({
      variantId: chosen.id,
      productSlug: product.slug,
      name: product.name,
      // Falls back to the variant's own name for a sizeless
      // product (a watch, a perfume) -- the cart line still
      // needs some label, and that's what the name is for.
      size: chosen.size ?? chosen.name,
      sku: chosen.sku,
      priceKes: chosen.priceKes,
      imageUrl: product.imageUrls[0] || null,
    });
    trackMetaAddToCart({ contentId: product.id, contentName: label, value: chosen.priceKes });
    trackXAddToCart({ contentId: product.id, contentName: label, value: chosen.priceKes });
    trackTikTokAddToCart({ contentId: product.id, contentName: label, value: chosen.priceKes });
    // Confirmed in place rather than by yanking the shopper to
    // the cart: most people add a second pair.
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  }

  const sizeless = !(product.variants.length > 1 || product.variants[0]?.size);

  return (
    <EliteLayout active="shop">
      <main className="lp-main-content de-product">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/shop">Shop</Link>
          {product.category ? (
            <>
              <span aria-hidden="true">/</span>
              <Link href={`/shop/category/${product.category.slug}`}>{product.category.name}</Link>
            </>
          ) : null}
        </nav>

        <section className="lp-container de-product-main">
          <div className="de-gallery">
            <div className="de-gallery-main">
              {product.imageUrls[image] ? (
                <Image
                  src={product.imageUrls[image]}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  style={{ objectFit: 'cover' }}
                  priority
                />
              ) : (
                <span className="de-gallery-placeholder" aria-hidden="true">
                  {product.name.charAt(0)}
                </span>
              )}
            </div>
            {product.imageUrls.length > 1 ? (
              <div className="de-gallery-thumbs">
                {product.imageUrls.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className={index === image ? 'is-on' : undefined}
                    onClick={() => setImage(index)}
                    aria-label={`View image ${index + 1}`}
                  >
                    <Image src={url} alt="" fill sizes="66px" style={{ objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="de-product-info">
            <div className="de-product-title-row">
              <div className="de-product-title-row-left">
                {product.brand ? <p className="de-product-brand"><Link href={`/shop/brand/${slugify(product.brand)}`}>{product.brand}</Link></p> : null}
                {product.isFeatured ? <span className="de-product-featured-flag">Featured</span> : null}
              </div>
              <div className="de-product-title-row-actions">
                <FavoriteButton productId={product.id} />
                <ShareButton
                  url={withReferral(absoluteUrl(`/shop/${product.slug}`), auth.customer)}
                  title={product.name}
                  text={`${product.name}${product.brand ? ` by ${product.brand}` : ''} — ${priceLabel(product)}`}
                />
              </div>
            </div>
            <h1>{product.name}</h1>
            {/* The rating beside the name, only once the product has enough approved reviews to show one (the server decides). */}
            {product.reviews?.visible && product.reviews.average !== null ? (
              <a className="de-rating" href="#reviews">
                <Stars value={product.reviews.average} size={16} />
                <span>{product.reviews.average.toFixed(1)} · {product.reviews.count} review{product.reviews.count === 1 ? '' : 's'}</span>
              </a>
            ) : null}
            <p className="de-product-price">
              {chosen ? formatKes(chosen.priceKes) : priceLabel(product)}
              {/* Struck-through original beside the sale price: a discount a
                  shopper cannot see the size of is not much of a discount. */}
              {chosen?.wasPriceKes ? (
                <>
                  <s className="de-price-was">{formatKes(chosen.wasPriceKes)}</s>
                  <span className="de-offer-badge">{chosen.offerLabel || 'Offer'}</span>
                </>
              ) : null}
            </p>
            {/* Only present for a logged-in reseller/wholesale viewer, and
                only once the client-side re-fetch above has resolved. */}
            {(chosen?.retailPriceKes ?? product.retailPriceFrom) ? (
              <p className="de-reseller-price">
                Retail <s>{formatKes(chosen?.retailPriceKes ?? product.retailPriceFrom!)}</s> · you keep{' '}
                {formatKes((chosen?.retailPriceKes ?? product.retailPriceFrom!) - (chosen ? chosen.priceKes : product.priceFrom))}
              </p>
            ) : null}

            {/* The reasons to trust the shop, in a line beside the price (the full wording is below the buttons). Short enough that the
                sizes stay on the first screen of a phone. */}
            <ul className="de-trustchips" aria-label="Why buy here">
              <li>Delivery across Kenya</li>
              <li>M-Pesa or card</li>
              <li>Try before you pay</li>
            </ul>

            <div className="de-sizes">
              {/* A single sizeless variant (a watch, a perfume) has nothing
                  to pick, so the heading and grid are skipped entirely --
                  just the SKU/stock note below, which still applies. */}
              {product.variants.length > 1 || product.variants[0]?.size ? (
                <>
                  <div className="de-sizes-head">
                    <span>{product.variants[0]?.size ? 'Select size' : 'Select an option'}</span>
                    {!product.anyInStock ? <em>Available to Order</em> : null}
                  </div>
                  <div className="de-size-buttons">
                    {product.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={!variant.canOrder}
                        className={`de-size${sizeId === variant.id ? ' is-on' : ''}${variant.inStock ? '' : ' is-preorder'}`}
                        onClick={() => setSizeId(variant.id)}
                        // Said out loud, because the note in the button
                        // styling is not available to a screen reader.
                        aria-label={`${variant.size ?? variant.name}${variant.inStock ? '' : ' — available to order'}`}
                      >
                        {(variant.size ?? variant.name).replace('EUR ', '')}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {chosen ? (
                <p className="de-size-note">
                  {sizeless ? '' : `${chosen.size ?? chosen.name} · `}
                  {chosen.inStock
                    ? 'In stock, ready to try on at the shop'
                    : 'Not on the shelf: we order it in for you (usual lead time applies)'}
                </p>
              ) : (
                <p className="de-size-note">
                  Not seeing your size? Message us and we will let you know.
                </p>
              )}
              {product.variants.length > 1 || product.variants[0]?.size ? (
                <label className="de-manual-size">
                  <span>Don&apos;t see your size? Type it in</span>
                  <input
                    type="text"
                    value={manualSize}
                    onChange={(event) => setManualSize(event.target.value)}
                    placeholder="e.g. EUR 46"
                  />
                </label>
              ) : null}
              {manualSize.trim() ? (
                <button
                  type="button"
                  className="lp-button de-manual-size-add"
                  onClick={() => {
                    cart.add({
                      variantId: null,
                      productSlug: product.slug,
                      name: product.name,
                      size: manualSize.trim(),
                      sku: '',
                      priceKes: chosen?.priceKes ?? product.priceFrom,
                      imageUrl: product.imageUrls[0] || null,
                      isCustomSize: true,
                    });
                    setManualSize('');
                    setAdded(true);
                    window.setTimeout(() => setAdded(false), 2500);
                  }}
                >
                  Add size {manualSize.trim()} to cart (pending confirmation)
                </button>
              ) : null}
            </div>

            <div className="de-actions" ref={actionsRef}>
              <button
                type="button"
                className="lp-button lp-button-primary"
                disabled={!chosen}
                onClick={addChosen}
              >
                {added ? 'Added ✓' : chosen ? `Add ${chosen.size ?? chosen.name} to Cart` : 'Select a size'}
              </button>

              {/* Once something is in the cart, checking out is the next thing
                  a shopper wants, so it looks like an action rather than the
                  line of status text it used to be. Sits right under Add to
                  Cart because that is where their eye already is. */}
              {cart.count > 0 ? (
                <Link href="/cart" className="lp-button de-checkout-btn">
                  Checkout ({cart.count} item{cart.count === 1 ? '' : 's'})
                </Link>
              ) : null}

              <a
                className="lp-button de-whatsapp"
                href={enquiry.whatsappHref(message)}
                onClick={() => enquiry.onWhatsAppClick('product-page')}
                target="_blank"
                rel="noreferrer"
              >
                {chosen ? 'Order on WhatsApp' : 'Ask about sizes on WhatsApp'}
              </a>
              <a className="lp-button lp-button-ghost" href={enquiry.phoneHref} data-source="product-page">
                Call {enquiry.phone}
              </a>
            </div>

            <ul className="de-assurances">
              <li>{enquiry.deliveryNote}</li>
              <li>Pay by M-Pesa or card online, or order on WhatsApp</li>
              <li>Try before you pay at either shop</li>
              <li>Open 08:00–20:00, Ronald Ngala Street</li>
            </ul>

            {product.description ? (
              <div className="de-product-copy"><p>{product.description}</p></div>
            ) : null}
          </div>
        </section>

        <ProductReviewsSection
          // A fresh start when another product (or its reviews) arrives, so one pair's list never lingers on another's page.
          key={`${product.id}-${product.reviews?.count ?? 0}`}
          slug={product.slug}
          productName={product.name}
          reviews={product.reviews ?? { visible: false, count: 0, average: null, distribution: null, minToShow: 3, items: [] }}
        />

        {product.related?.length ? (
          <section className="lp-container de-related">
            <h2>You might also like</h2>
            <div className="de-grid">
              {product.related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Phones only (see globals.css). Same three actions as the buttons above, kept in reach while those are out of view. */}
        {barOn ? (
          <div className="de-buybar" role="region" aria-label="Buy this pair">
            {added || cart.count > 0 ? (
              <Link href="/cart" className="de-buybar-strip">
                <span>{added ? 'Added to your cart ✓' : `${cart.count} item${cart.count === 1 ? '' : 's'} in your cart`}</span>
                <strong>Checkout →</strong>
              </Link>
            ) : null}
            <div className="de-buybar-row">
              <div className="de-buybar-price">
                <strong>{chosen ? formatKes(chosen.priceKes) : priceLabel(product)}</strong>
                {chosen && !sizeless ? <span>Size {(chosen.size ?? chosen.name).replace('EUR ', '')}</span> : null}
              </div>
              <button type="button" className="de-buybar-add" disabled={!chosen} onClick={addChosen}>
                {added ? 'Added ✓' : chosen ? 'Add to Cart' : 'Select a size'}
              </button>
              <a
                className="de-buybar-icon de-buybar-wa"
                href={enquiry.whatsappHref(message)}
                onClick={() => enquiry.onWhatsAppClick('product-bar')}
                target="_blank"
                rel="noreferrer"
                aria-label="Order on WhatsApp"
              >
                <WhatsAppIcon />
              </a>
              <a className="de-buybar-icon de-buybar-call" href={enquiry.phoneHref} data-source="product-bar" aria-label={`Call ${enquiry.phone}`}>
                <PhoneIcon />
              </a>
            </div>
          </div>
        ) : null}
      </main>
    </EliteLayout>
  );
}
