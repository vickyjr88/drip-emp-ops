"use client";

/**
 * Public site header, editable from the CMS under the "header" slug.
 *
 * Fetches on the client for the same reason the footer does: EliteLayout is a
 * server component wrapping every public page, and making it async would opt
 * each of those pages out of static rendering for the sake of a wordmark.
 *
 * The defaults passed to contentValue mirror what this rendered when it was
 * hardcoded, so the header looks identical until someone edits it, and it
 * still renders if the API is unreachable.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageContentDocument, contentValue, fetchPageContent } from '../lib/page-content';
import { MobileNav } from './mobile-nav';

export type NavLink = { label: string; href: string };

export const DEFAULT_NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Properties', href: '/properties' },
  { label: 'Areas', href: '/areas' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
  { label: 'Portal', href: '/portal' },
];

/**
 * Which nav key a link belongs to.
 *
 * Highlighting is driven by a key the page passes in, not by the URL, so a
 * link added in the CMS has to be mapped onto one. Deriving it from the href
 * means a new link highlights correctly without anyone editing this file,
 * and an unrecognised href simply never highlights rather than stealing the
 * highlight from another tab.
 */
export function navKeyForHref(href: string): string {
  const path = (href || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/') return 'search';
  if (path.startsWith('/properties') || path.startsWith('/listings')) return 'listings';
  if (path.startsWith('/areas')) return 'areas';
  if (path.startsWith('/services')) return 'services';
  if (path.startsWith('/about')) return 'profile';
  if (path.startsWith('/contact')) return 'contact';
  if (path.startsWith('/portal')) return 'portal';
  return `path:${path}`;
}

export function SiteHeader({ active }: { active: string }) {
  const [content, setContent] = useState<PageContentDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('header').then((document) => {
      if (!cancelled) setContent(document);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const wordmark = contentValue(content, 'brand.wordmark', 'Dirrir Realtors');
  const navLinks = contentValue<NavLink[]>(content, 'nav.items', DEFAULT_NAV_LINKS);
  const ctaLabel = contentValue(content, 'cta.label', 'Contact Professional');
  const ctaHref = contentValue(content, 'cta.href', '/contact');

  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <Link href="/" className="lp-brand" aria-label={`${wordmark} home`}>
          {wordmark}
        </Link>
        <nav className="lp-nav" aria-label="Primary">
          {navLinks.map((link) => {
            const key = navKeyForHref(link.href);
            return (
              <Link
                key={`${link.href}-${link.label}`}
                className={active === key ? 'is-active' : ''}
                href={link.href}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Link className="lp-button lp-button-primary lp-header-cta" href={ctaHref}>
          {ctaLabel}
        </Link>

        {/* Replaces both the nav and the CTA below 1060px, where they are
            hidden. Without it the header had no navigation at all. */}
        <MobileNav active={active} links={navLinks} ctaLabel={ctaLabel} ctaHref={ctaHref} />
      </div>
    </header>
  );
}
