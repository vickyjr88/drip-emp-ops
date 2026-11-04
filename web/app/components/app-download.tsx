/**
 * "Get the app" link to the Google Play listing. One component for every spot it appears, so the address, the
 * install-tracking placement and the wording cannot drift apart.
 */

import { appDownloadUrl } from '../lib/site';

export function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M5 3.2v17.6c0 .6.65.95 1.15.6l14.2-8.8a.7.7 0 0 0 0-1.2L6.15 2.6A.7.7 0 0 0 5 3.2Z" />
    </svg>
  );
}

type Variant = 'header' | 'menu' | 'band' | 'footer';

export function AppDownloadLink({
  placement,
  variant,
  onClick,
}: {
  placement: string;
  variant: Variant;
  onClick?: () => void;
}) {
  return (
    <a
      className={`lp-app-link is-${variant}`}
      href={appDownloadUrl(placement)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get the Drip Emporium app on Google Play"
      onClick={onClick}
    >
      <PlayIcon size={variant === 'header' ? 16 : 20} />
      {variant === 'header' ? (
        <>
          <span className="lp-app-link-long">Get the app</span>
          <span className="lp-app-link-short">App</span>
        </>
      ) : variant === 'band' || variant === 'menu' ? (
        <span className="lp-app-link-text">
          <small>Get it on</small>
          <strong>Google Play</strong>
        </span>
      ) : (
        <span>Get the app on Google Play</span>
      )}
    </a>
  );
}
