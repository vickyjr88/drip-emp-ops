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
 * There is no cart. The business sells over WhatsApp and across a counter; a
 * cart that ends in "we will email you" would be a worse version of what
 * already works.
 */

import Link from 'next/link';
import { useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';
import { ShopProduct, formatKes, priceLabel } from '../../lib/shop';

export function ProductClient({ product }: { product: ShopProduct }) {
  const enquiry = useEnquiryContact();
  const [sizeId, setSizeId] = useState<string | null>(
    product.variants.find((variant) => variant.inStock)?.id ?? null,
  );
  const [image, setImage] = useState(0);

  const chosen = product.variants.find((variant) => variant.id === sizeId) || null;

  const message = chosen
    ? `Hello Drip Emporium, I would like the ${product.name} in ${chosen.size} (${chosen.sku}) at ${formatKes(chosen.priceKes)}. Is it available?`
    : `Hello Drip Emporium, I am interested in the ${product.name}. What sizes do you have?`;

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
            {product.brand ? <p className="de-product-brand">{product.brand}</p> : null}
            <h1>{product.name}</h1>
            <p className="de-product-price">
              {chosen ? formatKes(chosen.priceKes) : priceLabel(product)}
            </p>

            <div className="de-sizes">
              <div className="de-sizes-head">
                <span>Select size (EUR)</span>
                {!product.anyInStock ? <em>All sizes sold out</em> : null}
              </div>
              <div className="de-size-buttons">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.inStock}
                    className={`de-size${sizeId === variant.id ? ' is-on' : ''}${variant.inStock ? '' : ' is-out'}`}
                    onClick={() => setSizeId(variant.id)}
                    // Said out loud, because the strikethrough alone is not
                    // available to a screen reader.
                    aria-label={`${variant.size}${variant.inStock ? '' : ' — sold out'}`}
                  >
                    {variant.size.replace('EUR ', '')}
                  </button>
                ))}
              </div>
              {chosen ? (
                <p className="de-size-note">
                  {chosen.size} · {chosen.sku} · in stock
                </p>
              ) : (
                <p className="de-size-note">
                  Not seeing your size? Message us — stock moves between our two shops.
                </p>
              )}
            </div>

            <div className="de-actions">
              <a
                className="lp-button lp-button-primary de-whatsapp"
                href={enquiry.whatsappHref(message)}
                target="_blank"
                rel="noreferrer"
              >
                {chosen ? `Order ${chosen.size.replace('EUR ', 'EUR ')} on WhatsApp` : 'Ask about sizes on WhatsApp'}
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
                <article key={item.id} className={`de-card${item.anyInStock ? '' : ' is-out'}`}>
                  <Link href={`/shop/${item.slug}`} className="de-card-media">
                    {item.imageUrls[0] ? (
                      <img src={item.imageUrls[0]} alt={item.name} loading="lazy" />
                    ) : (
                      <span className="de-card-placeholder" aria-hidden="true">{item.name.charAt(0)}</span>
                    )}
                  </Link>
                  <div className="de-card-body">
                    {item.brand ? <p className="de-card-brand">{item.brand}</p> : null}
                    <h3><Link href={`/shop/${item.slug}`}>{item.name}</Link></h3>
                    <p className="de-card-price">{priceLabel(item)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </EliteLayout>
  );
}
