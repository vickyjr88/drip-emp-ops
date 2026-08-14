/**
 * Icons for the service cards on the home and services pages.
 *
 * These were previously Material Symbols ligature names ("real_estate_agent")
 * rendered as text, but that font is never loaded -- the stylesheet only pulls
 * Libre Caslon and Manrope -- so the raw string showed inside the icon tile.
 * Inline SVG avoids adding a webfont just for five glyphs and inherits
 * currentColor, so the existing hover treatment keeps working unchanged.
 */

export type ServiceIconKey =
  | 'sales'
  | 'rentals'
  | 'advisory'
  | 'diaspora'
  | 'management'
  // Core values (About page).
  | 'transparency'
  | 'integrity'
  | 'community'
  | 'excellence';

const ICON_PATHS: Record<ServiceIconKey, JSX.Element> = {
  // House with a key line — buying and selling.
  sales: (
    <>
      <path d="M12 3 3 10v11h7v-6h4v6h7V10l-9-7Z" />
    </>
  ),
  // Key — lettings and rentals.
  rentals: (
    <>
      <path d="M14 3a7 7 0 0 0-6.7 9L3 16.3V21h4.7l1.4-1.4V18h1.6l1.4-1.4v-1.7h1.5A7 7 0 1 0 14 3Zm2.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
    </>
  ),
  // Bar chart with trend — advisory and market data.
  advisory: (
    <>
      <path d="M4 20h16v1H3V3h1v17Z" />
      <path d="M7 17h2.5v-5H7v5Zm4.75 0h2.5V8h-2.5v9ZM16.5 17H19V5h-2.5v12Z" />
    </>
  ),
  // Globe — diaspora and overseas clients.
  diaspora: (
    <>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15.6 15.6 0 0 0-1.2-5.3A8 8 0 0 1 18.9 11ZM12 4.2c.8 1.1 1.6 3.2 1.8 6.8h-3.6c.2-3.6 1-5.7 1.8-6.8ZM5.1 11a8 8 0 0 1 4.2-5.3A15.6 15.6 0 0 0 8.1 11h-3Zm0 2h3a15.6 15.6 0 0 0 1.2 5.3A8 8 0 0 1 5.1 13Zm6.9 6.8c-.8-1.1-1.6-3.2-1.8-6.8h3.6c-.2 3.6-1 5.7-1.8 6.8Zm2.7-1.5a15.6 15.6 0 0 0 1.2-5.3h3a8 8 0 0 1-4.2 5.3Z" />
    </>
  ),
  // Building with a maintenance cog — property management.
  management: (
    <>
      <path d="M4 21V4h10v6h6v11H4Zm2-2h6V6H6v13Zm8 0h4v-7h-4v7ZM8 8h2v2H8V8Zm0 4h2v2H8v-2Z" />
    </>
  ),
  // Eye — transparency, nothing hidden.
  transparency: (
    <>
      <path d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 12c-3.6 0-6.6-3.1-7-5 .4-1.9 3.4-5 7-5s6.6 3.1 7 5c-.4 1.9-3.4 5-7 5Z" />
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 5.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" />
    </>
  ),
  // Shield with a tick — integrity, acting in the client's interest.
  integrity: (
    <>
      <path d="M12 2 4 5.2v6.3c0 4.6 3.4 8.9 8 10.5 4.6-1.6 8-5.9 8-10.5V5.2L12 2Zm0 2.2 6 2.4v4.9c0 3.5-2.5 6.9-6 8.3-3.5-1.4-6-4.8-6-8.3V6.6l6-2.4Z" />
      <path d="m11 14.4-2.5-2.5 1.4-1.4 1.1 1.1 3.1-3.1 1.4 1.4-4.5 4.5Z" />
    </>
  ),
  // Three figures — community.
  community: (
    <>
      <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-4.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" />
      <path d="M12 12.5c-2.5 0-4.5 1.5-4.5 3.3V19h9v-3.2c0-1.8-2-3.3-4.5-3.3Zm2.7 4.7H9.3v-1.4c0-.6 1.1-1.5 2.7-1.5s2.7.9 2.7 1.5v1.4Z" />
      <path d="M5.5 10.6a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6ZM1.5 19v-2.4c0-1.3 1.2-2.4 2.8-2.7-.5.6-.8 1.3-.8 2.1V19h-2Zm17 0v-3c0-.8-.3-1.5-.8-2.1 1.6.3 2.8 1.4 2.8 2.7V19h-2Zm0-8.4a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z" />
    </>
  ),
  // Star — excellence.
  excellence: (
    <>
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1-5.4-3-5.4 3 1.2-6.1L3.3 9.4l6.1-.8L12 3Zm0 4.7-1.3 2.8-3 .4 2.2 2.1-.6 3 2.7-1.5 2.7 1.5-.6-3 2.2-2.1-3-.4L12 7.7Z" />
    </>
  ),
};

/**
 * Icons for the core values, resolved by position so a value added through the
 * CMS still gets one. Order matches the default values in
 * page-content.defaults.ts (Transparency, Integrity, Community, Excellence).
 */
const VALUE_ICON_ORDER: ServiceIconKey[] = ['transparency', 'integrity', 'community', 'excellence'];

export function valueIconForIndex(index: number): ServiceIconKey {
  return VALUE_ICON_ORDER[index % VALUE_ICON_ORDER.length];
}

export function ServiceIcon({ name }: { name: ServiceIconKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {ICON_PATHS[name] ?? ICON_PATHS.sales}
    </svg>
  );
}
