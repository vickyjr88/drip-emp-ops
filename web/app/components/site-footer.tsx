"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageContentDocument, contentValue, fetchPageContent } from '../lib/page-content';

type FooterLink = { label: string; href: string };

/**
 * Site footer, editable from the CMS under the "footer" slug.
 *
 * Fetches on the client rather than as a server component because EliteLayout
 * wraps ~30 pages, most of which are already client components -- a server-only
 * fetch here would not work under them. The built-in copy below renders first
 * and is replaced once the request resolves, so the footer is never empty and
 * does not shift beyond the text itself.
 */

/** Brand and model landing pages worth a link from every page (see lib/collections.ts). */
const POPULAR_LINKS = [
  { label: 'Nike', href: '/shop/brand/nike' },
  { label: 'Adidas', href: '/shop/brand/adidas' },
  { label: 'New Balance', href: '/shop/brand/new-balance' },
  { label: 'Air Force 1', href: '/shop/collection/air-force-1' },
  { label: 'Air Max', href: '/shop/collection/air-max' },
  { label: 'Jordan 4', href: '/shop/collection/jordan-4' },
];

const DEFAULT_QUICK_LINKS: FooterLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Shop All', href: '/shop' },
  { label: 'About Us', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Staff Portal', href: '/portal' },
];

const DEFAULT_SERVICE_LINKS: FooterLink[] = [
  { label: 'Sneakers', href: '/shop/category/sneakers' },
  { label: 'Boots', href: '/shop/category/boots' },
  { label: 'Casuals', href: '/shop/category/casuals' },
  { label: 'Sandals', href: '/shop/category/sandals' },
  { label: 'Officials', href: '/shop/category/officials' },
];

const DEFAULT_BOTTOM_LINKS: FooterLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Shop', href: '/shop' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Portal', href: '/portal' },
];

/**
 * Brand marks as inline SVG.
 *
 * Inline rather than an icon font or a sprite: the footer renders on every
 * page, and five small paths cost less than a network request that would block
 * the first paint. Each path is the official mark, drawn on a 24x24 grid so
 * they sit at one optical size.
 */
const SOCIAL_ICONS: Record<string, JSX.Element> = {
  x: (
    <path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-5.9l-4.62-6.04L5.94 21H2.92l7.06-8.07L2.5 3h6.05l4.18 5.52L17.53 3Zm-1.06 16.2h1.67L7.6 4.71H5.81l10.66 14.49Z" />
  ),
  facebook: (
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
  ),
  instagram: (
    <>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07Z" />
      <circle cx="12" cy="12" r="3.33" fill="none" strokeWidth="1.8" stroke="currentColor" />
      <circle cx="16.6" cy="7.4" r="1.1" />
    </>
  ),
  tiktok: (
    <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06v-3.1a5.67 5.67 0 0 0-.77-.05A5.68 5.68 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.24-1.48Z" />
  ),
  youtube: (
    <path d="M21.58 7.19a2.5 2.5 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.5 2.5 0 0 0-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81a2.5 2.5 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.5 2.5 0 0 0 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z" />
  ),
  linkedin: (
    <path d="M6.94 5.5a2.06 2.06 0 1 1-4.12 0 2.06 2.06 0 0 1 4.12 0ZM3.2 8.98h3.47V21H3.2V8.98Zm5.65 0h3.32v1.64h.05c.46-.87 1.6-1.8 3.29-1.8 3.51 0 4.16 2.31 4.16 5.32V21h-3.47v-5.16c0-1.23-.02-2.82-1.72-2.82-1.72 0-1.98 1.34-1.98 2.73V21H8.85V8.98Z" />
  ),
};

/** Only web addresses are ever linked: a mistyped or hostile value in the CMS must not become a javascript: link. */
const safeHref = (value: string) => (/^https:\/\//i.test(value.trim()) ? value.trim() : '');

const GoogleG = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.7-3.78H1.34v3.09A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.36 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.34a12 12 0 0 0 0 10.8l4.02-3.09Z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.34 6.6l4.02 3.09A7.15 7.15 0 0 1 12 4.75Z" />
  </svg>
);

/**
 * Two asks of customers, set from the CMS "footer" document: rate the shop on Google (with the rating
 * as it stands) and join the WhatsApp group. Each half is hidden while its address is blank.
 */
function CommunityStrip({ content }: { content: PageContentDocument | null }) {
  const googleUrl = safeHref(contentValue(content, 'community.googleProfileUrl', ''));
  const whatsappUrl = safeHref(contentValue(content, 'community.whatsappGroupUrl', ''));
  if (!googleUrl && !whatsappUrl) return null;

  const rating = Number.parseFloat(contentValue(content, 'community.googleRating', ''));
  const count = Number.parseInt(contentValue(content, 'community.googleReviewCount', ''), 10);
  const showRating = Number.isFinite(rating) && rating > 0 && rating <= 5 && Number.isFinite(count) && count > 0;
  const filled = Math.round(rating);

  return (
    <div className="lp-footer-community">
      {googleUrl ? (
        <div className="lp-footer-community-item">
          <h4>{contentValue(content, 'community.googleHeading', 'Bought from us? Tell others how it went')}</h4>
          {showRating ? (
            <p className="lp-footer-rating" aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${count} Google review${count === 1 ? '' : 's'}`}>
              <span className="lp-footer-stars" aria-hidden="true">{'★'.repeat(filled)}{'☆'.repeat(5 - filled)}</span>
              <strong>{rating.toFixed(1)}</strong> from {count} Google review{count === 1 ? '' : 's'}
            </p>
          ) : null}
          <a className="lp-footer-cta" href={googleUrl} target="_blank" rel="noreferrer">
            {GoogleG} {contentValue(content, 'community.googleButtonLabel', 'Rate us on Google')}
          </a>
        </div>
      ) : null}
      {whatsappUrl ? (
        <div className="lp-footer-community-item">
          <h4>{contentValue(content, 'community.whatsappHeading', 'Get new arrivals first')}</h4>
          <a className="lp-footer-cta is-whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.95L2 22l5.2-1.5A9.9 9.9 0 1 0 12.04 2Zm5.8 14.1c-.25.7-1.45 1.33-2 1.4-.5.07-1.13.1-1.82-.12a16.6 16.6 0 0 1-1.65-.6c-2.9-1.25-4.8-4.15-4.95-4.35-.15-.2-1.18-1.57-1.18-3 0-1.43.75-2.13 1.02-2.42.27-.3.58-.37.78-.37h.55c.18 0 .42-.07.65.5.25.58.83 2.02.9 2.17.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.32.38-.45.52-.15.15-.3.3-.13.6.17.3.77 1.27 1.65 2.05 1.13 1 2.08 1.3 2.38 1.45.3.15.47.12.65-.07.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.7.8 2 .95.3.15.5.22.57.35.07.12.07.72-.18 1.4Z" />
            </svg>{' '}
            {contentValue(content, 'community.whatsappButtonLabel', 'Join our WhatsApp group')}
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function SiteFooter() {
  const [content, setContent] = useState<PageContentDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('footer').then((document) => {
      if (!cancelled) setContent(document);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const brandHeading = contentValue(content, 'brand.heading', 'Drip Emporium');
  const brandDescription = contentValue(
    content,
    'brand.description',
    'Quality affordable sneakers and streetwear in Nairobi. Ronald Ngala Street, open 08:00 to 20:00.',
  );

  const quickHeading = contentValue(content, 'quickLinks.heading', 'Quick Links');
  const quickLinks = contentValue<FooterLink[]>(content, 'quickLinks.items', DEFAULT_QUICK_LINKS);

  const servicesHeading = contentValue(content, 'services.heading', 'Shop');
  const serviceLinks = contentValue<FooterLink[]>(content, 'services.items', DEFAULT_SERVICE_LINKS);

  const contactHeading = contentValue(content, 'contact.heading', 'Contact Us');
  const email = contentValue(content, 'contact.email', 'hello@dripemporium.store');
  const phone = contentValue(content, 'contact.phone', '+254 113 206 481');
  const address = contentValue(content, 'contact.address', 'Nairobi, Kenya');

  const copyright = contentValue(
    content,
    'bottom.copyright',
    '© 2026 Drip Emporium. All Rights Reserved.',
  );
  const bottomLinks = contentValue<FooterLink[]>(content, 'bottom.links', DEFAULT_BOTTOM_LINKS);
  const legalLinks = contentValue<FooterLink[]>(content, 'bottom.legalLinks', []);

  const socialHeading = contentValue(content, 'social.heading', 'Follow Us');
  // Only profiles with a URL are shown, so an account the firm does not keep
  // never renders as a link to nowhere.
  const socialLinks = (
    [
      { key: 'x', label: 'X' },
      { key: 'facebook', label: 'Facebook' },
      { key: 'instagram', label: 'Instagram' },
      { key: 'tiktok', label: 'TikTok' },
      { key: 'youtube', label: 'YouTube' },
      { key: 'linkedin', label: 'LinkedIn' },
    ] as const
  )
    .map((item) => ({ ...item, href: contentValue(content, `social.${item.key}`, '') }))
    .filter((item) => item.href.trim());

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <CommunityStrip content={content} />
        <div className="lp-footer-grid">
          <section className="lp-footer-brand">
            <h3>{brandHeading}</h3>
            <p>{brandDescription}</p>
            {socialLinks.length > 0 ? (
              <nav className="lp-footer-social-icons" aria-label={socialHeading}>
                {socialLinks.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    // The mark carries no text, so the accessible name comes
                    // from here rather than from the glyph.
                    aria-label={item.label}
                    title={item.label}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      {SOCIAL_ICONS[item.key]}
                    </svg>
                  </a>
                ))}
              </nav>
            ) : null}
          </section>

          <section>
            <h4>{quickHeading}</h4>
            {quickLinks.map((link, index) => (
              <Link key={`${link.href}-${index}`} href={link.href || '/'}>
                {link.label}
              </Link>
            ))}
          </section>

          <section>
            <h4>{servicesHeading}</h4>
            {serviceLinks.map((link, index) => (
              <Link key={`${link.href}-${index}`} href={link.href || '/shop'}>
                {link.label}
              </Link>
            ))}
            {/* Brand and model pages: a sitewide route in for the searches people actually type. */}
            {POPULAR_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </section>

          <section>
            <h4>{contactHeading}</h4>
            {email ? <a href={`mailto:${email}`}>{email}</a> : null}
            {/* Strip spacing from the tel: target; the display text keeps it. */}
            {phone ? <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>{phone}</a> : null}
            {address ? <p>{address}</p> : null}
          </section>
        </div>

        <div className="lp-footer-bottom">
          <span>{copyright}</span>
          <div>
            {bottomLinks.map((link, index) => (
              <Link key={`${link.href}-${index}`} href={link.href || '/'}>
                {link.label}
              </Link>
            ))}
            {legalLinks.map((link, index) => (
              <Link key={`legal-${link.href}-${index}`} href={link.href || '/'}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
