"use client";

/**
 * The portal's side menu: related pages grouped under a heading, an icon on each, groups that fold away, and a "find a page" box.
 *
 * Why groups: the menu was one flat list of 36 pages in the order they were added. Staff who sell all day never need Payroll or the Audit Log,
 * and nobody could say where Reseller Payouts lived without scanning everything. Grouping by the job being done (sell, stock, resellers,
 * marketing, reports and money, people, system) lets a person fold away what they do not use. A group that holds the current page is always open.
 *
 * Tours: the tour overlay spotlights links by data-tour="nav.<key>". A folded group has no size on screen, so the tour code opens the group
 * before it measures (see use-tour-anchor.ts). The keys, and the PortalNavKey union they come from, stay in portal-shell.tsx, where the
 * anchor check reads them.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote, BarChart3, BellRing, Boxes, CalendarDays, ClipboardList, FileText, Handshake, Image as ImageIcon, Images, Landmark, LayoutDashboard,
  LayoutGrid, Lightbulb, type LucideIcon, Megaphone, MessageCircle, MessageCircleQuestion, Package, PenLine, Plus, Receipt, ScrollText, Search,
  Share2, ShieldCheck, Shirt, ShoppingCart, Sparkles, Star, Store, Tag, Upload, UserCog, UserPlus, UsersRound, Wallet, Watch,
} from 'lucide-react';
import type { PortalNavKey } from './portal-shell';

type NavItem = { key: PortalNavKey; href: string; label: string; icon: LucideIcon };
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'sell', label: 'Sell', icon: Receipt, items: [
      { key: 'orders', href: '/portal/orders', label: 'Orders', icon: Receipt },
      { key: 'cartLeads', href: '/portal/cart-leads', label: 'Cart Leads', icon: ShoppingCart },
      { key: 'customers', href: '/portal/customers', label: 'Customers', icon: UsersRound },
      { key: 'offers', href: '/portal/offers', label: 'Offers', icon: Tag },
      { key: 'inquiries', href: '/portal/inquiries', label: 'Inquiries', icon: MessageCircleQuestion },
      { key: 'consignments', href: '/portal/consignments', label: 'Consignments', icon: Handshake },
      { key: 'reminders', href: '/portal/reminders', label: 'Reminders', icon: BellRing },
    ],
  },
  {
    // Catalogue before inventory: the order things are set up in.
    id: 'stock', label: 'Products', icon: Package, items: [
      { key: 'catalogue', href: '/portal/catalogue', label: 'Catalogue', icon: Package },
      { key: 'categories', href: '/portal/categories', label: 'Categories', icon: LayoutGrid },
      { key: 'featuredProducts', href: '/portal/featured-products', label: 'Featured Products', icon: Sparkles },
      { key: 'kits', href: '/portal/kits', label: 'Kits', icon: Shirt },
      { key: 'watches', href: '/portal/watches', label: 'Watches', icon: Watch },
      { key: 'media', href: '/portal/media', label: 'Media', icon: ImageIcon },
      { key: 'inventory', href: '/portal/inventory', label: 'Inventory', icon: Boxes },
      { key: 'stores', href: '/portal/stores', label: 'Stores', icon: Store },
      { key: 'importers', href: '/portal/importers', label: 'Importers', icon: Upload },
    ],
  },
  {
    id: 'resellers', label: 'Resellers', icon: UsersRound, items: [
      { key: 'resellers', href: '/portal/resellers', label: 'Resellers', icon: UsersRound },
      { key: 'resellerApplications', href: '/portal/reseller-applications', label: 'Applications', icon: UserPlus },
      { key: 'resellerPayouts', href: '/portal/reseller-payouts', label: 'Payouts', icon: Banknote },
    ],
  },
  {
    id: 'marketing', label: 'Marketing', icon: Megaphone, items: [
      { key: 'campaigns', href: '/portal/campaigns', label: 'Campaigns', icon: Megaphone },
      { key: 'outreach', href: '/portal/outreach', label: 'WhatsApp Outreach', icon: MessageCircle },
      { key: 'statusKit', href: '/portal/status-kit', label: 'WhatsApp Status', icon: Images },
      { key: 'social', href: '/portal/social', label: 'Social Posting', icon: Share2 },
      { key: 'reviews', href: '/portal/reviews', label: 'Reviews', icon: Star },
      { key: 'blog', href: '/portal/blog', label: 'Blog', icon: PenLine },
      { key: 'content', href: '/portal/content', label: 'Site Content', icon: FileText },
    ],
  },
  {
    id: 'reports', label: 'Reports & money', icon: BarChart3, items: [
      { key: 'analytics', href: '/portal/analytics', label: 'Analytics', icon: BarChart3 },
      { key: 'insights', href: '/portal/insights', label: 'Insights', icon: Lightbulb },
      { key: 'dailyReport', href: '/portal/daily-report', label: 'Daily Report', icon: ClipboardList },
      { key: 'accounting', href: '/portal/accounting', label: 'Accounting', icon: Landmark },
    ],
  },
  {
    id: 'people', label: 'People', icon: UserCog, items: [
      { key: 'users', href: '/portal/users', label: 'Users', icon: UserCog },
      { key: 'hr', href: '/portal/hr', label: 'Staff & Leave', icon: CalendarDays },
      { key: 'payroll', href: '/portal/payroll', label: 'Payroll', icon: Wallet },
    ],
  },
  {
    id: 'system', label: 'System', icon: ShieldCheck, items: [
      { key: 'audit', href: '/portal/audit', label: 'Audit Log', icon: ScrollText },
      { key: 'rbac', href: '/portal/rbac', label: 'Roles & permissions', icon: ShieldCheck },
    ],
  },
];

const DASHBOARD: NavItem = { key: 'dashboard', href: '/portal', label: 'Dashboard', icon: LayoutDashboard };
const STORAGE_KEY = 'portal.nav.folded';

function readFolded(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeFolded(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private windows and blocked storage: the menu simply forgets next time.
  }
}

type PortalNavProps = {
  active: PortalNavKey;
  canReadRbac: boolean;
  canReadUsers: boolean;
  /** Called after a link is followed, so the mobile drawer can close. */
  onNavigate: () => void;
};

export function PortalNav({ active, canReadRbac, canReadUsers, onNavigate }: PortalNavProps) {
  const [folded, setFolded] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Read the saved folds after mount, so the server render and the first client render agree.
  useEffect(() => { setFolded(readFolded()); }, []);

  // Ctrl/Cmd+K jumps to the finder from anywhere in the portal.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const groups = useMemo(() => NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.key === 'rbac') return canReadRbac;
        if (item.key === 'users') return canReadUsers || canReadRbac;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0), [canReadRbac, canReadUsers]);

  const needle = query.trim().toLowerCase();
  const everything: Array<NavItem & { group?: string }> = [DASHBOARD, ...groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))];
  const matches = needle ? everything.filter((item) => `${item.label} ${item.group ?? ''}`.toLowerCase().includes(needle)) : [];

  function link(item: NavItem, extra?: string) {
    const isActive = active === item.key;
    const Icon = item.icon;
    return (
      <Link
        key={item.key}
        href={item.href}
        className={`pnav-link${isActive ? ' is-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        data-tour={`nav.${item.key}`}
        onClick={() => { setQuery(''); onNavigate(); }}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        <span>{item.label}</span>
        {extra ? <small>{extra}</small> : null}
      </Link>
    );
  }

  return (
    <nav className="portal-sidebar-nav pnav" aria-label="Sections">
      <Link href="/portal/orders/new" className="pnav-new" onClick={onNavigate} data-tour="nav.newOrder">
        <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
        <span>New order</span>
      </Link>

      <label className="pnav-find">
        <Search size={15} strokeWidth={1.9} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Find a page"
          aria-label="Find a page"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { setQuery(''); (event.target as HTMLInputElement).blur(); }
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              router.push(matches[0].href);
              setQuery('');
              onNavigate();
            }
          }}
        />
        <kbd aria-hidden="true">⌘K</kbd>
      </label>

      {needle ? (
        <div className="pnav-results">
          {matches.length === 0 ? <p className="pnav-none">No page called “{query.trim()}”.</p> : matches.map((item) => link(item, item.group))}
        </div>
      ) : (
        <>
          {link(DASHBOARD)}
          {groups.map((group) => {
            const holdsActive = group.items.some((item) => item.key === active);
            const open = holdsActive || !folded.includes(group.id);
            const GroupIcon = group.icon;
            return (
              <details
                key={group.id}
                className="pnav-group"
                open={open}
                data-nav-group={group.id}
                onToggle={(event) => {
                  const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                  // The group holding the current page cannot be folded away: it would hide where the person is.
                  if (!isOpen && holdsActive) { (event.currentTarget as HTMLDetailsElement).open = true; return; }
                  const next = isOpen ? folded.filter((id) => id !== group.id) : folded.includes(group.id) ? folded : [...folded, group.id];
                  if (next !== folded && next.length !== folded.length) { setFolded(next); writeFolded(next); }
                }}
              >
                <summary className="pnav-heading">
                  <GroupIcon size={15} strokeWidth={1.9} aria-hidden="true" />
                  <span>{group.label}</span>
                  <svg className="pnav-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="pnav-items">{group.items.map((item) => link(item))}</div>
              </details>
            );
          })}
        </>
      )}
    </nav>
  );
}
