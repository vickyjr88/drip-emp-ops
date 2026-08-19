"use client";

/**
 * Share a product link.
 *
 * Uses the device's native share sheet where one exists -- on a phone that is
 * the fastest way to hand a listing to someone on WhatsApp, which is how most
 * of this shop's trade already happens. A desktop browser has no share sheet,
 * so there the button copies the link instead and says so, rather than
 * silently doing nothing or opening a share dialog nobody asked for.
 */

import { useState } from 'react';

type ShareButtonProps = {
  url: string;
  title: string;
  text?: string;
  className?: string;
  /** Icon-only, for tight spaces like a card overlay. */
  compact?: boolean;
};

export function ShareButton({ url, title, text, className, compact }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onShare(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // AbortError when the user cancels the share sheet -- not a failure.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the link
      // itself is still right there in the address bar to copy by hand.
    }
  }

  return (
    <button
      type="button"
      className={`de-share-btn${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      onClick={onShare}
      aria-label={copied ? 'Link copied' : 'Share'}
      title={copied ? 'Link copied' : 'Share'}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          </svg>
          {!compact ? <span className="de-share-label">Share</span> : null}
        </>
      )}
    </button>
  );
}
