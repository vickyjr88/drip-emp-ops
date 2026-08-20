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
 */

import Link from 'next/link';
import { useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { ProductCard } from '../../components/product-card';
import { ShareButton } from '../../components/share-button';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';
import { useCart } from '../../lib/cart';
import { useCustomerAuth } from '../../lib/customer-auth';
import { absoluteUrl } from '../../lib/site';
import { ShopProduct, formatKes, priceLabel } from '../../lib/shop';

export function ProductClient({ product }: { product: ShopProduct }) {
  const enquiry = useEnquiryContact();
  const cart = useCart();
  const auth = useCustomerAuth();
  const [added, setAdded] = useState(false);
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

  const chosen = product.variants.find((variant) => variant.id === sizeId) || null;

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
      lines.push(`Size:  ${chosen.size}`);
      lines.push(`SKU:   ${chosen.sku}`);
      lines.push(`Price: ${formatKes(chosen.priceKes)}`);
      // Saying it is out of stock up front stops the shop replying "yes" to
      // something that needs a supplier order first.
      if (!chosen.inStock) lines.push('(Currently ordered in from our supplier — usual lead time applies)');
    } else {
      lines.push(`Hello Drip Emporium, I am interested in the ${product.name}.`);
      lines.push('');
      lines.push('What sizes do you have?');
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

  return (
    <EliteLayout active="shop">
      <main className="lp-main-content de-product">
        <nav className="lp-container de-crumbs" aria-label="Breadcrumb">
          <Link href="/shop">Shop</Link>
          {product.category ? (
            <>
              <span aria-hidden="true">/</span>
              <Link href={`/shop?category=${product.category.slug}`}>{product.category.name}</Link>
            </>
          ) : null}
        </nav>

        <section className="lp-container de-product-main">
          <div className="de-gallery">
            <div className="de-gallery-main">
              {product.imageUrls[image] ? (
                <img src={product.imageUrls[image]} alt={product.name} />
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
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="de-product-info">
            <div className="de-product-title-row">
              {product.brand ? <p className="de-product-brand">{product.brand}</p> : null}
              <ShareButton
                url={absoluteUrl(`/shop/${product.slug}`)}
                title={product.name}
                text={`${product.name}${product.brand ? ` by ${product.brand}` : ''} — ${priceLabel(product)}`}
              />
            </div>
            <h1>{product.name}</h1>
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

            <div className="de-sizes">
              <div className="de-sizes-head">
                <span>Select size (EUR)</span>
                {!product.anyInStock ? <em>Ordered in from supplier</em> : null}
              </div>
              <div className="de-size-buttons">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.canOrder}
                    className={`de-size${sizeId === variant.id ? ' is-on' : ''}${variant.inStock ? '' : ' is-preorder'}`}
                    onClick={() => setSizeId(variant.id)}
                    // Said out loud, because the note in the button styling
                    // is not available to a screen reader.
                    aria-label={`${variant.size}${variant.inStock ? '' : ' — ordered in from supplier'}`}
                  >
                    {variant.size.replace('EUR ', '')}
                  </button>
                ))}
              </div>
              {chosen ? (
                <p className="de-size-note">
                  {chosen.size} · {chosen.sku} · {chosen.inStock ? 'in stock' : 'ordered in from supplier'}
                </p>
              ) : (
                <p className="de-size-note">
                  Not seeing your size? Message us — stock moves between our two shops.
                </p>
              )}
            </div>

            <div className="de-actions">
              <button
                type="button"
                className="lp-button lp-button-primary"
                disabled={!chosen}
                onClick={() => {
                  if (!chosen) return;
                  cart.add({
                    variantId: chosen.id,
                    productSlug: product.slug,
                    name: product.name,
                    size: chosen.size,
                    sku: chosen.sku,
                    priceKes: chosen.priceKes,
                    imageUrl: product.imageUrls[0] || null,
                  });
                  // Confirmed in place rather than by yanking the shopper to
                  // the cart: most people add a second pair.
                  setAdded(true);
                  window.setTimeout(() => setAdded(false), 2500);
                }}
              >
                {added ? 'Added ✓' : chosen ? `Add ${chosen.size} to Cart` : 'Select a size'}
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
                target="_blank"
                rel="noreferrer"
              >
                {chosen ? 'Or order on WhatsApp' : 'Ask about sizes on WhatsApp'}
              </a>
              <a className="lp-button lp-button-ghost" href={enquiry.phoneHref}>
                Call {enquiry.phone}
              </a>
            </div>

            {/* The three things a shopper checks before committing. */}
            <ul className="de-assurances">
              <li>Free delivery on orders over KSh 15,000</li>
              <li>Try before you pay at either shop</li>
              <li>Open 08:00–20:00, Ronald Ngala Street</li>
            </ul>

            {product.description ? (
              <div className="de-product-copy"><p>{product.description}</p></div>
            ) : null}
          </div>
        </section>

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
      </main>
    </EliteLayout>
  );
}
