"use client";

/**
 * Hamburger menu for the public site.
 *
 * Below 1060px the primary nav was simply `display: none` with nothing to
 * replace it, so Home, Listings, Services, About and Portal were unreachable
 * from the header -- the only way to move around was to scroll to the footer
 * links. This is that missing control.
 *
 * A client component so the layout itself can stay server-rendered; only the
 * open/closed state needs to be interactive.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_NAV_LINKS, NavLink, navKeyForHref } from './site-header';

/**
 * Links come from SiteHeader, which reads them from the CMS, so the mobile
 * menu and the desktop nav cannot drift apart -- they were two hardcoded
 * copies of the same list before.
 */
export function MobileNav({
  active,
  links = DEFAULT_NAV_LINKS,
  ctaLabel = 'Contact A Team',
  ctaHref = '/contact',
}: {
  active: string;
  links?: NavLink[];
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes, and focus returns to the button that opened it rather than
  // being dropped at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // The panel covers the page, so the content behind it must not scroll --
  // otherwise closing the menu leaves you somewhere else entirely.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lp-menu-toggle"
        aria-expanded={open}
        aria-controls="lp-menu-panel"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`lp-menu-icon${open ? ' is-open' : ''}`} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>

      {open ? (
        <div
          className="lp-menu-panel"
          id="lp-menu-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          tabIndex={-1}
          ref={panelRef}
        >
          <nav className="lp-menu-panel-links" aria-label="Primary">
            {links.map((item) => {
              const key = navKeyForHref(item.href);
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={active === key ? 'is-active' : undefined}
                  aria-current={active === key ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href={ctaHref}
            className="lp-button lp-button-primary lp-menu-panel-cta"
            onClick={() => setOpen(false)}
          >
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </>
  );
}
