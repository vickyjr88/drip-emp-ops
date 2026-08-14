"use client";

import { TourProvider } from './tours/tour-provider';

/**
 * Hosts the tour context for every portal route.
 *
 * This has to be a layout, not a page. Each section (/portal/operations,
 * /portal/finance, /portal/units, ...) is its own route component that
 * re-exports the same PortalPage, so navigating between them unmounts and
 * remounts the whole page tree. A provider inside a page therefore lost its
 * state the instant a tour stepped across sections, which is why tours only
 * ever appeared to work on the section you started from.
 *
 * Next keeps layouts mounted across navigations between their child routes,
 * so the active tour, its step index and the checklist state all survive.
 * Pages register the signed-in profile via useRegisterTourViewer once loaded.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <TourProvider>{children}</TourProvider>;
}
