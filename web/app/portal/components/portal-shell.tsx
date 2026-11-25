"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRegisterTourViewer, useTours } from '../tours/tour-provider';
import { TourChecklist } from '../tours/checklist';
import { PortalNav } from './portal-nav';

export type PortalNavKey =
  | 'dashboard'
  | 'stores'
  | 'catalogue'
  | 'media'
  | 'kits'
  | 'watches'
  | 'featuredProducts'
  | 'categories'
  | 'inventory'
  | 'orders'
  | 'cartLeads'
  | 'resellers'
  | 'resellerApplications'
  | 'resellerPayouts'
  | 'campaigns'
  | 'consignments'
  | 'offers'
  | 'customers'
  | 'outreach'
  | 'inquiries'
  | 'reviews'
  | 'accounting'
  | 'analytics'
  | 'insights'
  | 'dailyReport'
  | 'social'
  | 'statusKit'
  | 'reminders'
  | 'content'
  | 'blog'
  | 'users'
  | 'hr'
  | 'payroll'
  | 'importers'
  | 'audit'
  | 'rbac'
  | 'settings';

const PAGE_TITLES: Record<PortalNavKey, string> = {
  dashboard: 'Dashboard',
  stores: 'Stores',
  catalogue: 'Catalogue',
  media: 'Media Library',
  kits: 'Kits and Design Center',
  watches: 'Watches',
  featuredProducts: 'Featured Products',
  categories: 'Categories',
  inventory: 'Inventory',
  orders: 'Orders',
  cartLeads: 'Cart Leads',
  resellers: 'Resellers',
  resellerApplications: 'Reseller Applications',
  resellerPayouts: 'Reseller Payouts',
  campaigns: 'Marketing Campaigns',
  consignments: 'Consignments',
  offers: 'Offers',
  customers: 'Customers',
  outreach: 'WhatsApp Outreach',
  inquiries: 'Inquiries',
  reviews: 'Reviews',
  accounting: 'Accounting',
  analytics: 'Analytics',
  insights: 'Insights',
  dailyReport: 'Daily Report',
  social: 'Social Posting',
  statusKit: 'WhatsApp Status',
  reminders: 'Reminders',
  content: 'Site Content',
  blog: 'Blog',
  users: 'Users',
  hr: 'Staff & Leave',
  payroll: 'Payroll',
  importers: 'Importers',
  audit: 'Audit Log',
  rbac: 'Roles & permissions',
  settings: 'Settings',
};

type PortalShellProps = {
  active: PortalNavKey;
  pageTitle?: string;
  pageSubtitle?: string;
  email: string;
  roleLabel: string;
  permissionCount: number;
  canReadRbac?: boolean;
  canReadUsers?: boolean;
  onLogout: () => void;
  onRefresh?: () => void;
  /**
   * Tour context. Supplied here rather than by each page so that every section
   * -- including the standalone ones like HR and Payroll that render this
   * shell directly -- can host in-context tour launchers without each one
   * remembering to wrap itself in a provider.
   *
   * Omit them and the shell renders without tours rather than failing, which
   * keeps this backwards-compatible for any caller not yet passing a profile.
   */
  tourUserId?: string;
  tourPermissions?: string[];
  tourIsAdmin?: boolean;
  children: React.ReactNode;
};

export function PortalShell({
  active,
  pageTitle,
  pageSubtitle,
  email,
  roleLabel,
  permissionCount,
  canReadRbac = false,
  canReadUsers = false,
  onLogout,
  onRefresh,
  tourUserId,
  tourPermissions,
  tourIsAdmin = false,
  children,
}: PortalShellProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  // On mobile the sidebar collapsed into a horizontally-scrolling strip of 19
  // items -- present, but not something anyone could navigate. It is a drawer
  // instead, opened from the topbar.
  const [navOpen, setNavOpen] = useState(false);

  // Register whichever profile this page loaded with the layout's provider.
  useRegisterTourViewer(
    tourUserId
      ? { id: tourUserId, permissions: tourPermissions || [], roles: tourIsAdmin ? [{ name: 'ADMIN' }] : [] }
      : null,
  );
  const { checklistVisible, setChecklistVisible, hasViewer, availableTours, progress } = useTours();

  const safeAvailableTours = Array.isArray(availableTours) ? availableTours : [];
  const toursDone = safeAvailableTours.filter(
    (tour) => progress && progress[tour.id]?.status === 'COMPLETED',
  ).length;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Scrolling the page with the mouse over a focused number box changes the number (a price of 3,800 becomes 3,799 on the way down the page).
  // Dropping focus first lets the wheel scroll the page and leaves the value alone.
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      const field = document.activeElement;
      if (field instanceof HTMLInputElement && field.type === 'number' && event.target === field) field.blur();
    }
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setNavOpen(false);
    }

    // The drawer overlays the workspace, so the page behind it must not scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen]);

  const title = pageTitle || PAGE_TITLES[active];
  const shell = (
    <div className="portal-shell">
      {navOpen ? (
        <button
          type="button"
          className="portal-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={`portal-sidebar${navOpen ? ' is-open' : ''}`}
        aria-label="Portal navigation"
      >
        <div className="portal-sidebar-brand">
          <p className="portal-kicker">Control Center</p>
          <strong>Operations</strong>
        </div>
        <PortalNav
          active={active}
          canReadRbac={canReadRbac}
          canReadUsers={canReadUsers}
          onNavigate={() => setNavOpen(false)}
        />

        {hasViewer && safeAvailableTours.length > 0 ? (
          <button
            type="button"
            className="portal-sidebar-tours"
            onClick={() => setChecklistVisible(!checklistVisible)}
            aria-pressed={checklistVisible}
          >
            <span>{checklistVisible ? 'Hide getting started' : 'Getting started'}</span>
            <span className="portal-sidebar-tours-count">
              {toursDone}/{safeAvailableTours.length}
            </span>
          </button>
        ) : null}
      </aside>

      <div className="portal-workspace">
        <header className="portal-topbar">
          <div className="portal-topbar-heading">
            {/* Only rendered on mobile, where the sidebar is a drawer. On wider
                screens the sidebar is always visible and this is hidden. */}
            <button
              type="button"
              className="portal-nav-toggle"
              aria-expanded={navOpen}
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
              onClick={() => setNavOpen((value) => !value)}
            >
              {/* A side-panel glyph rather than the storefront's three-line
                  hamburger: the two buttons sit stacked on a phone and open
                  different things (site nav vs. portal sections), so they
                  need to read as different controls at a glance, not just to
                  a screen reader. */}
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <line x1="9.5" y1="4" x2="9.5" y2="20" stroke="currentColor" strokeWidth="1.7" />
                <line x1="5.5" y1="8" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="5.5" y1="11" x2="7" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="portal-topbar-copy">
              <p className="portal-kicker">Portfolio Portal</p>
              <h1 className="portal-page-title">{title}</h1>
              {pageSubtitle ? <p className="portal-page-subtitle">{pageSubtitle}</p> : null}
            </div>
          </div>

          <div className="portal-topbar-actions">
            {onRefresh ? (
              <button type="button" className="portal-ghost-btn portal-topbar-refresh" onClick={onRefresh}>
                Refresh
              </button>
            ) : null}

            <div className="portal-profile-menu" ref={profileRef}>
              <button
                type="button"
                className="portal-profile-trigger"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                data-tour="portal.profile"
                onClick={() => setProfileOpen((open) => !open)}
              >
                <span className="portal-profile-email">{email}</span>
                <span className="portal-profile-caret" aria-hidden>
                  ▾
                </span>
              </button>

              {profileOpen ? (
                <div className="portal-profile-dropdown" role="menu">
                  <div className="portal-profile-meta">
                    <p className="portal-kicker">Signed in</p>
                    <strong>{email}</strong>
                    <p className="portal-role">Roles: {roleLabel}</p>
                    <p className="portal-role">Permissions: {permissionCount}</p>
                  </div>
                  <button
                    type="button"
                    className="portal-ghost-btn portal-profile-signout"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="portal-workspace-body">
          {/* Rendered here, not by individual pages. It used to live in the
              dashboard page only, so a tour ending on Payroll or Accounting
              left the user with no way to start another without navigating
              back -- and the sidebar toggle flipped a flag nothing rendered.
              Every section that uses this shell now gets the panel. */}
          <TourChecklist />
          {children}
        </div>
      </div>
    </div>
  );

  // The provider now lives in portal/layout.tsx, above the router, so it
  // survives navigation between sections. This shell just registers whichever
  // profile its page loaded; see useRegisterTourViewer.
  return shell;
}
