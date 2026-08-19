"use client";

/**
 * Home.
 *
 * Rewritten for the shop: the previous version searched property listings and
 * called three endpoints that went with the property domain. It leads with
 * what is actually for sale, because a shopper landing here is deciding
 * whether this shop has their kind of shoe, not reading about the business.
 *
 * Copy comes from the CMS so it can be changed without a deploy; the products
 * come from the live catalogue so the page is never advertising something that
 * sold out yesterday.
 */

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EliteLayout } from './components/elite-layout';
import { ProductCard } from './components/product-card';
import { PageContentDocument, contentValue, fetchPageContent } from './lib/page-content';
import { ShopCategory, ShopProduct, fetchCategories, fetchProducts } from './lib/shop';
import { useEnquiryContact } from './lib/use-enquiry-contact';

type TrustBadge = { title: string; description: string };
type BrandItem = { name: string; logo?: string };

/** One icon per badge, resolved by position. A fifth custom badge falls back
 *  to a plain checkmark rather than breaking the row. */
const TRUST_ICONS = [
  // Shield / authentic
  <path key="shield" d="M12 2 4 5v6c0 5 3.4 8.6 8 9 4.6-.4 8-4 8-9V5l-8-3Zm-1.2 12.4L7 10.6l1.4-1.4 2.4 2.4L15.6 7l1.4 1.4-6.2 6Z" />,
  // Trending / spark
  <path key="trend" d="m3 17 6-6 4 4 8-8v3h2V4h-6v2h3l-7 7-4-4-7 7Z" />,
  // Bag / easy shopping
  <path key="bag" d="M7 7V6a5 5 0 0 1 10 0v1h3l-1 14H5L4 7Zm2 0h6V6a3 3 0 0 0-6 0Z" />,
  // Truck / delivery
  <path key="truck" d="M3 6h11v9H3Zm11 3h4l3 3v3h-7Zm-8.5 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm11 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />,
];
const FALLBACK_TRUST_ICON = <path key="check" d="m9 16.2-3.5-3.6L4 14.1l5 5 11-11-1.5-1.5Z" />;

export default function HomeClient() {
  const router = useRouter();
  const enquiry = useEnquiryContact();

  const [content, setContent] = useState<PageContentDocument | null>(null);
  const [newest, setNewest] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('home').then((doc) => { if (!cancelled) setContent(doc); });
    void fetchProducts({ inStockOnly: 'true' }).then((rows) => {
      if (!cancelled) setNewest(rows.slice(0, 10));
    });
    void fetchCategories().then((rows) => { if (!cancelled) setCategories(rows); });
    return () => { cancelled = true; };
  }, []);

  const heroHeading = contentValue(content, 'hero.heading', 'Quality Affordable\nSneakers & Streetwear');
  const heroSubheading = contentValue(
    content,
    'hero.subheading',
    'Curating the finest sneakers and premium streetwear. Define your look, own your style, stay fresh.',
  );
  const heroBackground = contentValue(content, 'hero.backgroundImage', '');

  const categoriesHeading = contentValue(content, 'services.heading', 'Shop By Category');
  const categoriesSub = contentValue(
    content,
    'services.subheading',
    'Sneakers, boots, casuals, sandals, officials and cleaning agents — all in one place.',
  );

  const newestHeading = contentValue(content, 'featured.heading', 'In Stock Now');
  const newestSub = contentValue(
    content,
    'featured.subheading',
    'Fresh pairs on the shelf at Ronald Ngala Street. Sizes move fast.',
  );

  const trustHeading = contentValue(content, 'trust.heading', 'Why Shop With Us');
  const trustSub = contentValue(content, 'trust.subheading', '');
  const trustItems = contentValue<TrustBadge[]>(content, 'trust.items', []);

  const brandsHeading = contentValue(content, 'brands.heading', 'Brands We Carry');
  const brandItems = contentValue<BrandItem[]>(content, 'brands.items', []);

  const midCtaEnabled = contentValue(content, 'midCta.enabled', true);
  const midCtaHeading = contentValue(content, 'midCta.heading', 'Free Delivery on Orders Over KES 15,000');
  const midCtaBody = contentValue(
    content,
    'midCta.body',
    'Nationwide, on us. Shop the full range and check out in minutes.',
  );
  const midCtaLabel = contentValue(content, 'midCta.ctaLabel', 'Shop Now');

  const aboutHeading = contentValue(content, 'about.heading', '');
  const aboutBody = contentValue(content, 'about.body', '');
  const aboutImage = contentValue(content, 'about.image', '');
  const aboutLinkLabel = contentValue(content, 'about.linkLabel', 'More About Us');
  const aboutLinkHref = contentValue(content, 'about.linkHref', '/about');

  const ctaHeading = contentValue(content, 'cta.heading', 'Cannot find your size?');
  const ctaBody = contentValue(
    content,
    'cta.body',
    'Message us — stock moves between our two shops and we will tell you straight away what we have.',
  );

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    router.push(term ? `/shop?search=${encodeURIComponent(term)}` : '/shop');
  }

  return (
    <EliteLayout active="search">
      <main className="lp-main-content de-home">
        <section className="lp-hero" id="search">
          <div
            className="lp-hero-image"
            aria-hidden="true"
            style={heroBackground ? { backgroundImage: `url(${heroBackground})` } : undefined}
          />
          <div className="lp-hero-overlay" aria-hidden="true" />
          <div className="lp-container lp-hero-content">
            <h1>
              {heroHeading.split('\n').map((line: string, index: number) => (
                <span key={index}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </h1>
            <p>{heroSubheading}</p>

            <form className="de-home-search" onSubmit={onSearch}>
              <input
                type="search"
                value={search}
                aria-label="Search the shop"
                placeholder="Search Nike, Jordan, Samba…"
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="submit" className="lp-button lp-button-black">Search</button>
            </form>

            <div className="de-home-hero-actions">
              <Link className="lp-button lp-button-primary" href="/shop">Shop All Shoes</Link>
              {/* Green, like every other WhatsApp action on the site. It was
                  lp-button-ghost -- near-black text on transparent -- which
                  over the dark hero came out at 1.08:1 and was invisible. */}
              <a
                className="lp-button de-whatsapp"
                href={enquiry.whatsappHref('Hello Drip Emporium, I am looking for a pair of shoes.')}
                target="_blank"
                rel="noreferrer"
              >
                Ask on WhatsApp
              </a>
            </div>
          </div>
        </section>

        {trustItems.length ? (
          <section className="lp-container de-home-trust">
            {trustHeading || trustSub ? (
              <div className="lp-heading-center">
                {trustHeading ? <h2>{trustHeading}</h2> : null}
                {trustSub ? <p>{trustSub}</p> : null}
              </div>
            ) : null}
            <div className="de-trust-grid">
              {trustItems.map((item, index) => (
                <article key={`${item.title}-${index}`} className="de-trust-badge">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {TRUST_ICONS[index] || FALLBACK_TRUST_ICON}
                  </svg>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {categories.length ? (
          <section className="lp-container de-home-cats">
            <div className="lp-heading-center">
              <h2>{categoriesHeading}</h2>
              <span className="lp-divider" aria-hidden="true" />
              <p>{categoriesSub}</p>
            </div>
            <div className="de-cat-grid">
              {categories.map((category) => (
                <Link key={category.slug} href={`/shop?category=${category.slug}`} className="de-cat">
                  <span>{category.name}</span>
                  <em>{category.productCount} style{category.productCount === 1 ? '' : 's'}</em>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {brandItems.length ? (
          <section className="lp-container de-home-brands">
            {brandsHeading ? <p className="de-brands-heading">{brandsHeading}</p> : null}
            <div className="de-brands-row">
              {brandItems.map((brand, index) => (
                <div key={`${brand.name}-${index}`} className="de-brand-item">
                  {brand.logo ? (
                    <img src={brand.logo} alt={brand.name} loading="lazy" />
                  ) : (
                    <span>{brand.name}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {newest.length ? (
          <section className="lp-container de-home-new">
            <div className="de-home-new-head">
              <div>
                <h2>{newestHeading}</h2>
                <p>{newestSub}</p>
              </div>
              <Link className="lp-button lp-button-ghost" href="/shop">View All</Link>
            </div>

            <div className="de-grid">
              {newest.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {midCtaEnabled && midCtaHeading ? (
          <section className="de-mid-cta">
            <div className="lp-container de-mid-cta-inner">
              <div>
                <h2>{midCtaHeading}</h2>
                {midCtaBody ? <p>{midCtaBody}</p> : null}
              </div>
              <Link className="lp-button lp-button-primary" href="/shop">{midCtaLabel}</Link>
            </div>
          </section>
        ) : null}

        {aboutBody ? (
          <section className="lp-home-about" id="about">
            <div className="lp-container lp-home-about-inner">
              <div className="lp-home-about-copy">
                <h2>{aboutHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
                <p>{aboutBody}</p>
                {aboutLinkLabel ? (
                  <Link className="lp-button lp-button-ghost" href={aboutLinkHref}>{aboutLinkLabel}</Link>
                ) : null}
              </div>
              {aboutImage ? (
                <div className="lp-home-about-media">
                  <img src={aboutImage} alt="" />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="lp-cta" id="contact">
          <div className="lp-container lp-cta-inner">
            <div>
              <h2>{ctaHeading}</h2>
              <p>{ctaBody}</p>
            </div>
            <div className="lp-cta-actions">
              <a
                className="lp-button lp-button-primary"
                href={enquiry.whatsappHref('Hello Drip Emporium, do you have my size?')}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp Us
              </a>
              <Link className="lp-button lp-button-outline-light" href="/contact">
                Visit a Shop
              </Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
