"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type PortalNavKey =
  | 'projects'
  | 'units'
  | 'customers'
  | 'operations'
  | 'finance'
  | 'accounting'
  | 'analytics'
  | 'users'
  | 'rbac';

const NAV_ITEMS: Array<{ key: PortalNavKey; href: string; label: string }> = [
  { key: 'projects', href: '/portal/projects', label: 'Projects' },
  { key: 'units', href: '/portal/units', label: 'Units' },
  { key: 'customers', href: '/portal/customers', label: 'Customers' },
  { key: 'operations', href: '/portal/operations', label: 'Operations' },
  { key: 'finance', href: '/portal/finance', label: 'Finance' },
  { key: 'accounting', href: '/portal/accounting', label: 'Accounting' },
  { key: 'analytics', href: '/portal/analytics', label: 'Analytics' },
  { key: 'users', href: '/portal/users', label: 'Users' },
  { key: 'rbac', href: '/portal/rbac', label: 'RBAC' },
];

const PAGE_TITLES: Record<PortalNavKey, string> = {
  projects: 'Projects',
  units: 'Units',
  customers: 'Customers',
  operations: 'Operations',
  finance: 'Finance',
  accounting: 'Accounting',
  analytics: 'Analytics',
  users: 'Users',
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
  children,
}: PortalShellProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

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

  const title = pageTitle || PAGE_TITLES[active];
  const navItems = NAV_ITEMS.filter((item) => {
    if (item.key === 'rbac') return canReadRbac;
    if (item.key === 'users') return canReadUsers || canReadRbac;
    return true;
  });

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar" aria-label="Portal navigation">
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
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="portal-workspace">
        <header className="portal-topbar">
          <div className="portal-topbar-copy">
            <p className="portal-kicker">Portfolio Portal</p>
            <h1 className="portal-page-title">{title}</h1>
            {pageSubtitle ? <p className="portal-page-subtitle">{pageSubtitle}</p> : null}
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

        <div className="portal-workspace-body">{children}</div>
      </div>
    </div>
  );
}
