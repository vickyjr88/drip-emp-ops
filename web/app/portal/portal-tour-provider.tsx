"use client";

import { TourProvider } from './tours/tour-provider';

/**
 * Hosts the tour context for every portal route.
 *
 * Split out of layout.tsx so that file can be a genuine server component --
 * "use client" on a layout silently disables export const dynamic on every
 * page underneath it (confirmed directly: adding the export to a client
 * page/layout changed nothing in the build output). Every /portal/* page is
 * itself "use client" with no server-side dynamic data source Next can see
 * at build time, so without a server-rendered ancestor forcing dynamic
 * rendering, the whole portal got statically prerendered once at build time
 * and cached for a year (x-nextjs-cache: HIT, s-maxage=31536000) -- meaning
 * every redeploy's new JS/CSS chunk hashes left the previous static HTML
 * referencing files that no longer exist on disk, 404ing everything and
 * leaving the page completely unstyled with "Loading..." stuck forever.
 *
 * This component keeps the exact previous behaviour and comment -- it has
 * to be a layout, not a page, so the tour survives navigating between
 * sections that would otherwise remount the whole page tree.
 */
export function PortalTourProvider({ children }: { children: React.ReactNode }) {
  return <TourProvider>{children}</TourProvider>;
}
