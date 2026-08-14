"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRegisterTourViewer, useTours } from '../tours/tour-provider';
import { TourChecklist } from '../tours/checklist';

export type PortalNavKey =
  | 'dashboard'
  | 'stores'
  | 'catalogue'
  | 'inventory'
  | 'orders'
  | 'resellers'
  | 'consignments'
  | 'customers'
  | 'accounting'
  | 'analytics'
  | 'reminders'
  | 'content'
  | 'users'
  | 'hr'
  | 'payroll'
  | 'importers'
  | 'audit'
  | 'rbac';

const NAV_ITEMS: Array<{ key: PortalNavKey; href: string; label: string }> = [
  { key: 'dashboard', href: '/portal', label: 'Dashboard' },
  // Catalogue before inventory before orders: the order things are set up in.
  { key: 'stores', href: '/portal/stores', label: 'Stores' },
  { key: 'catalogue', href: '/portal/catalogue', label: 'Catalogue' },
  { key: 'inventory', href: '/portal/inventory', label: 'Inventory' },
  { key: 'orders', href: '/portal/orders', label: 'Orders' },
  { key: 'consignments', href: '/portal/consignments', label: 'Consignments' },
  { key: 'resellers', href: '/portal/resellers', label: 'Resellers' },
  { key: 'customers', href: '/portal/customers', label: 'Customers' },
  { key: 'accounting', href: '/portal/accounting', label: 'Accounting' },
  { key: 'analytics', href: '/portal/analytics', label: 'Analytics' },
  { key: 'reminders', href: '/portal/reminders', label: 'Reminders' },
  { key: 'content', href: '/portal/content', label: 'Site Content' },
  { key: 'users', href: '/portal/users', label: 'Users' },
  { key: 'hr', href: '/portal/hr', label: 'Staff & Leave' },
  { key: 'payroll', href: '/portal/payroll', label: 'Payroll' },
  { key: 'importers', href: '/portal/importers', label: 'Importers' },
  { key: 'audit', href: '/portal/audit', label: 'Audit Log' },
  { key: 'rbac', href: '/portal/rbac', label: 'RBAC' },
];

const PAGE_TITLES: Record<PortalNavKey, string> = {
  dashboard: 'Dashboard',
  stores: 'Stores',
  catalogue: 'Catalogue',
  inventory: 'Inventory',
  orders: 'Orders',
  resellers: 'Resellers',
  consignments: 'Consignments',
  customers: 'Customers',
  accounting: 'Accounting',
  analytics: 'Analytics',
  reminders: 'Reminders',
  content: 'Site Content',
  users: 'Users',
  hr: 'Staff & Leave',
  payroll: 'Payroll',
  importers: 'Importers',
  audit: 'Audit Log',
  rbac: 'RBAC',
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

  const toursDone = availableTours.filter(
    (tour) => progress[tour.id]?.status === 'COMPLETED',
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
  const navItems = NAV_ITEMS.filter((item) => {
    if (item.key === 'rbac') return canReadRbac;
    if (item.key === 'users') return canReadUsers || canReadRbac;
    return true;
  });

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
        <nav className="portal-sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={active === item.key ? 'is-active' : undefined}
              aria-current={active === item.key ? 'page' : undefined}
              // Tour anchor. Derived from the nav key so the two cannot drift;
              // see web/app/portal/tours/catalogue.ts.
              data-tour={`nav.${item.key}`}
              onClick={() => setNavOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Way back to the Getting Started panel. Hiding it used to be
            one-way -- there was no control anywhere to bring it back. Lives in
            the sidebar so it is reachable from every section, not just the
            dashboard where the panel itself renders. */}
        {hasViewer && availableTours.length > 0 ? (
          <button
            type="button"
            className="portal-sidebar-tours"
            onClick={() => setChecklistVisible(!checklistVisible)}
            aria-pressed={checklistVisible}
          >
            <span>{checklistVisible ? 'Hide getting started' : 'Getting started'}</span>
            <span className="portal-sidebar-tours-count">
              {toursDone}/{availableTours.length}
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
              <span className={`lp-menu-icon${navOpen ? ' is-open' : ''}`} aria-hidden>
                <span />
                <span />
                <span />
              </span>
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
