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

const DEFAULT_QUICK_LINKS: FooterLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Search Listings', href: '/listings' },
  { label: 'About Our Firm', href: '/about' },
  { label: 'Contact Agent', href: '/contact' },
  { label: 'Client Portal', href: '/portal' },
];

const DEFAULT_SERVICE_LINKS: FooterLink[] = [
  { label: 'Property Sales', href: '/services#property-sales' },
  { label: 'Rentals & Lettings', href: '/services#rentals-lettings' },
  { label: 'Property Advisory', href: '/services#property-advisory' },
  { label: 'Diaspora Investment', href: '/services#diaspora-investment' },
  { label: 'Property Management', href: '/services#property-management' },
];

const DEFAULT_BOTTOM_LINKS: FooterLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Listings', href: '/listings' },
  { label: 'Contact', href: '/contact' },
  { label: 'Portal', href: '/portal' },
];

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
    'Your professional partner in Nairobi real estate, providing verified listings, transparent process, and long-term value.',
  );

  const quickHeading = contentValue(content, 'quickLinks.heading', 'Quick Links');
  const quickLinks = contentValue<FooterLink[]>(content, 'quickLinks.items', DEFAULT_QUICK_LINKS);

  const servicesHeading = contentValue(content, 'services.heading', 'Services');
  const serviceLinks = contentValue<FooterLink[]>(content, 'services.items', DEFAULT_SERVICE_LINKS);

  const contactHeading = contentValue(content, 'contact.heading', 'Contact Us');
  const email = contentValue(content, 'contact.email', 'info@dripemporium.store');
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
      { key: 'facebook', label: 'Facebook' },
      { key: 'instagram', label: 'Instagram' },
      { key: 'tiktok', label: 'TikTok' },
      { key: 'linkedin', label: 'LinkedIn' },
    ] as const
  )
    .map((item) => ({ ...item, href: contentValue(content, `social.${item.key}`, '') }))
    .filter((item) => item.href.trim());

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <section className="lp-footer-brand">
            <h3>{brandHeading}</h3>
            <p>{brandDescription}</p>
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
              <Link key={`${link.href}-${index}`} href={link.href || '/services'}>
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

        {socialLinks.length > 0 ? (
          <div className="lp-footer-social">
            <span>{socialHeading}</span>
            <div className="lp-footer-social-links">
              {socialLinks.map((item) => (
                <a key={item.key} href={item.href} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}

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
