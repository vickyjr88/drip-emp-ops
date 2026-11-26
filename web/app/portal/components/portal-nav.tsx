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
  Banknote, BarChart3, Bell, BellRing, Boxes, CalendarDays, ClipboardList, FileText, Handshake, Image as ImageIcon, Images, Landmark, LayoutDashboard,
  LayoutGrid, Lightbulb, type LucideIcon, Megaphone, MessageCircle, MessageCircleQuestion, Package, PenLine, Plus, Receipt, ScrollText, Search,
  Settings,
  Share2, ShieldCheck, Shirt, ShoppingCart, Sparkles, Star, Store, Tag, TrendingUp, Upload, UserCog, UserPlus, UsersRound, Wallet, Watch,
} from 'lucide-react';
import type { PortalNavKey } from './portal-shell';
import { useTours } from '../tours/tour-provider';
import { TOKEN_KEY, apiRequest, formatMoney } from '../accounting/lib';
import { realEmail } from '../../lib/contact-email';

/** `needs`: the permission the page's own data requires. Without it the page opens but only says "you do not have permission", so the link is hidden. */
type NavItem = { key: PortalNavKey; href: string; label: string; icon: LucideIcon; needs?: string };
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'sell', label: 'Sell', icon: Receipt, items: [
      { key: 'orders', href: '/portal/orders', label: 'Orders', icon: Receipt, needs: 'order.read' },
      { key: 'cartLeads', href: '/portal/cart-leads', label: 'Cart Leads', icon: ShoppingCart, needs: 'cart-lead.read' },
      { key: 'customers', href: '/portal/customers', label: 'Customers', icon: UsersRound, needs: 'customer.read' },
      { key: 'offers', href: '/portal/offers', label: 'Offers', icon: Tag, needs: 'offer.read' },
      { key: 'inquiries', href: '/portal/inquiries', label: 'Inquiries', icon: MessageCircleQuestion, needs: 'inquiry.read' },
      { key: 'consignments', href: '/portal/consignments', label: 'Consignments', icon: Handshake, needs: 'consignment.read' },
      { key: 'reminders', href: '/portal/reminders', label: 'Reminders', icon: BellRing, needs: 'reminder-rule.read' },
    ],
  },
  {
    // Catalogue before inventory: the order things are set up in.
    id: 'stock', label: 'Products', icon: Package, items: [
      { key: 'catalogue', href: '/portal/catalogue', label: 'Catalogue', icon: Package, needs: 'product.read' },
      { key: 'categories', href: '/portal/categories', label: 'Categories', icon: LayoutGrid, needs: 'product-category.read' },
      { key: 'featuredProducts', href: '/portal/featured-products', label: 'Featured Products', icon: Sparkles, needs: 'product.read' },
      { key: 'kits', href: '/portal/kits', label: 'Kits', icon: Shirt, needs: 'product.read' },
      { key: 'watches', href: '/portal/watches', label: 'Watches', icon: Watch, needs: 'product.read' },
      { key: 'media', href: '/portal/media', label: 'Media', icon: ImageIcon },
      { key: 'inventory', href: '/portal/inventory', label: 'Inventory', icon: Boxes, needs: 'stock-level.read' },
      { key: 'stores', href: '/portal/stores', label: 'Stores', icon: Store, needs: 'store.read' },
      { key: 'importers', href: '/portal/importers', label: 'Importers', icon: Upload },
    ],
  },
  {
    id: 'resellers', label: 'Resellers', icon: UsersRound, items: [
      { key: 'resellers', href: '/portal/resellers', label: 'Resellers', icon: UsersRound, needs: 'customer.read' },
      { key: 'resellerApplications', href: '/portal/reseller-applications', label: 'Applications', icon: UserPlus, needs: 'reseller-application.read' },
      { key: 'resellerPayouts', href: '/portal/reseller-payouts', label: 'Payouts', icon: Banknote, needs: 'reseller-payout.read' },
    ],
  },
  {
    id: 'marketing', label: 'Marketing', icon: Megaphone, items: [
      { key: 'campaigns', href: '/portal/campaigns', label: 'Campaigns', icon: Megaphone, needs: 'marketing-campaign.read' },
      { key: 'outreach', href: '/portal/outreach', label: 'WhatsApp Outreach', icon: MessageCircle, needs: 'customer.read' },
      { key: 'statusKit', href: '/portal/status-kit', label: 'WhatsApp Status', icon: Images, needs: 'social-post.read' },
      { key: 'social', href: '/portal/social', label: 'Social Posting', icon: Share2, needs: 'social-post.read' },
      { key: 'reviews', href: '/portal/reviews', label: 'Reviews', icon: Star, needs: 'product-review.read' },
      { key: 'blog', href: '/portal/blog', label: 'Blog', icon: PenLine, needs: 'blog-post.read' },
      { key: 'content', href: '/portal/content', label: 'Site Content', icon: FileText, needs: 'page-content.read' },
    ],
  },
  {
    id: 'reports', label: 'Reports & money', icon: BarChart3, items: [
      { key: 'salesReport', href: '/portal/sales-report', label: 'Sales Report', icon: TrendingUp, needs: 'order.read' },
      { key: 'analytics', href: '/portal/analytics', label: 'Analytics', icon: BarChart3 },
      { key: 'insights', href: '/portal/insights', label: 'Insights', icon: Lightbulb, needs: 'customer.read' },
      { key: 'dailyReport', href: '/portal/daily-report', label: 'Daily Report', icon: ClipboardList, needs: 'daily-report-setting.read' },
      { key: 'accounting', href: '/portal/accounting', label: 'Accounting', icon: Landmark, needs: 'journal-entry.read' },
    ],
  },
  {
    id: 'people', label: 'People', icon: UserCog, items: [
      { key: 'users', href: '/portal/users', label: 'Users', icon: UserCog },
      { key: 'hr', href: '/portal/hr', label: 'Staff & Leave', icon: CalendarDays, needs: 'employee.read' },
      { key: 'payroll', href: '/portal/payroll', label: 'Payroll', icon: Wallet, needs: 'payroll-run.read' },
    ],
  },
  {
    id: 'system', label: 'System', icon: ShieldCheck, items: [
      { key: 'notifications', href: '/portal/notifications', label: 'Notifications', icon: Bell, needs: 'alert-setting.read' },
      { key: 'settings', href: '/portal/settings', label: 'Settings', icon: Settings, needs: 'credential.read' },
      { key: 'audit', href: '/portal/audit', label: 'Audit Log', icon: ScrollText, needs: 'audit-log.read' },
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

type FoundCustomer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; priceTier: string; businessName: string | null };
type FoundOrder = { id: string; orderNumber: string; status: string; total: string | number; customerName?: string | null; customerPhone?: string | null };
type FoundProduct = { variantId: string; productId: string; productName: string; variantName: string; sku: string; priceKes: number; sellable: number };
type Records = { customers: FoundCustomer[]; orders: FoundOrder[]; products: FoundProduct[] };
const NO_RECORDS: Records = { customers: [], orders: [], products: [] };

/**
 * What the finder shows besides pages: the customers, orders and products matching what was typed. "0722 111" from anywhere in the portal
 * lands on that customer. Each source is asked only if the person may read it, and a failed one is simply left out.
 */
function useRecordSearch(text: string, can: { customers: boolean; orders: boolean; products: boolean }) {
  const [records, setRecords] = useState<Records>(NO_RECORDS);
  const [busy, setBusy] = useState(false);
  const canKey = `${can.customers}${can.orders}${can.products}`;

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) { setRecords(NO_RECORDS); setBusy(false); return; }
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      const ask = <T,>(allowed: boolean, path: string): Promise<T[]> => (allowed
        ? apiRequest<T[]>(path, { method: 'GET', signal: controller.signal }, token).catch(() => [])
        : Promise.resolve([]));
      void Promise.all([
        ask<FoundCustomer>(can.customers, `/customers/lookup?q=${encodeURIComponent(q)}&limit=4`),
        (can.orders
          ? apiRequest<{ items: FoundOrder[] }>(`/orders?search=${encodeURIComponent(q)}&skip=0&take=4`, { method: 'GET', signal: controller.signal }, token).then((r) => r.items).catch(() => [])
          : Promise.resolve([] as FoundOrder[])),
        ask<FoundProduct>(can.products, `/products/variants/lookup?q=${encodeURIComponent(q)}&limit=4`),
      ]).then(([customers, orders, products]) => {
        if (controller.signal.aborted) return;
        setRecords({ customers, orders, products });
        setBusy(false);
      });
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text, canKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { records, busy };
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
  const [activeEntry, setActiveEntry] = useState(-1);
  // Who is signed in, as registered by the page. Until a page has registered them, everything shows (the API refuses what they cannot do anyway).
  const { viewer } = useTours();

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

  const canKeyIn = !viewer || viewer.isAdmin || (viewer.permissions ?? []).includes('order.create');
  const viewerKey = viewer ? `${viewer.isAdmin}|${(viewer.permissions ?? []).join(',')}` : '';
  const groups = useMemo(() => NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.key === 'rbac') return canReadRbac;
        if (item.key === 'users') return canReadUsers || canReadRbac;
        if (!item.needs || !viewer || viewer.isAdmin) return true;
        return (viewer.permissions ?? []).includes(item.needs);
      }),
    }))
    .filter((group) => group.items.length > 0), [canReadRbac, canReadUsers, viewerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = query.trim().toLowerCase();
  const everything: Array<NavItem & { group?: string }> = [DASHBOARD, ...groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))];
  const matches = needle ? everything.filter((item) => `${item.label} ${item.group ?? ''}`.toLowerCase().includes(needle)) : [];

  const mayRead = (permission: string) => !viewer || viewer.isAdmin || (viewer.permissions ?? []).includes(permission);
  const { records, busy: searching } = useRecordSearch(query, { customers: mayRead('customer.read'), orders: mayRead('order.read'), products: mayRead('product.read') });

  // One list for the keyboard to move through: pages first, then customers, orders, products.
  const entries: Array<{ href: string }> = needle ? [
    ...matches.map((item) => ({ href: item.href })),
    ...records.customers.map((c) => ({ href: `/portal/customers/${c.id}` })),
    ...records.orders.map((o) => ({ href: `/portal/orders/${o.id}` })),
    ...records.products.map((p) => ({ href: `/portal/catalogue/${p.productId}` })),
  ] : [];
  useEffect(() => { setActiveEntry(-1); }, [query]);

  function go(href: string) {
    router.push(href);
    setQuery('');
    onNavigate();
  }

  function link(item: NavItem, extra?: string, hover = false) {
    const isActive = active === item.key;
    const Icon = item.icon;
    return (
      <Link
        key={item.key}
        href={item.href}
        className={`pnav-link${isActive ? ' is-active' : ''}${hover ? ' is-hover' : ''}`}
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
      {canKeyIn ? (
        <Link href="/portal/orders/new" className="pnav-new" onClick={onNavigate} data-tour="nav.newOrder">
          <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
          <span>New order</span>
        </Link>
      ) : null}

      <label className="pnav-find" data-tour="nav.find">
        <Search size={15} strokeWidth={1.9} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Find anything"
          aria-label="Find a page, customer or order"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { setQuery(''); (event.target as HTMLInputElement).blur(); }
            if (event.key === 'ArrowDown' && entries.length) { event.preventDefault(); setActiveEntry((i) => (i + 1) % entries.length); }
            if (event.key === 'ArrowUp' && entries.length) { event.preventDefault(); setActiveEntry((i) => (i <= 0 ? entries.length - 1 : i - 1)); }
            if (event.key === 'Enter' && entries.length) {
              event.preventDefault();
              go(entries[activeEntry >= 0 ? activeEntry : 0].href);
            }
          }}
        />
        <kbd aria-hidden="true">⌘K</kbd>
      </label>

      {needle ? (
        <div className="pnav-results" role="listbox" aria-label="Matches">
          {matches.length > 0 ? <p className="pnav-section">Pages</p> : null}
          {matches.map((item, i) => link(item, item.group, i === activeEntry))}

          {records.customers.length > 0 ? <p className="pnav-section">Customers</p> : null}
          {records.customers.map((c, i) => {
            const at = matches.length + i;
            return (
              <Link key={c.id} href={`/portal/customers/${c.id}`} className={`pnav-record${at === activeEntry ? ' is-hover' : ''}`} onClick={() => { setQuery(''); onNavigate(); }}>
                <strong>{c.firstName} {c.lastName}{c.priceTier !== 'RETAIL' ? <span className={`ptag ptag-${c.priceTier.toLowerCase()}`}>{c.priceTier === 'RESELLER' ? 'Reseller' : 'Wholesale'}</span> : null}</strong>
                <small>{[c.businessName, c.phone, realEmail(c.email)].filter(Boolean).join(' · ')}</small>
              </Link>
            );
          })}

          {records.orders.length > 0 ? <p className="pnav-section">Orders</p> : null}
          {records.orders.map((o, i) => {
            const at = matches.length + records.customers.length + i;
            return (
              <Link key={o.id} href={`/portal/orders/${o.id}`} className={`pnav-record${at === activeEntry ? ' is-hover' : ''}`} onClick={() => { setQuery(''); onNavigate(); }}>
                <strong>{o.orderNumber}</strong>
                <small>{[o.customerName, formatMoney(o.total), o.status].filter(Boolean).join(' · ')}</small>
              </Link>
            );
          })}

          {records.products.length > 0 ? <p className="pnav-section">Products</p> : null}
          {records.products.map((p, i) => {
            const at = matches.length + records.customers.length + records.orders.length + i;
            return (
              <Link key={p.variantId} href={`/portal/catalogue/${p.productId}`} className={`pnav-record${at === activeEntry ? ' is-hover' : ''}`} onClick={() => { setQuery(''); onNavigate(); }}>
                <strong>{p.productName}</strong>
                <small>{[p.variantName !== p.productName ? p.variantName : null, p.sku, formatMoney(p.priceKes), `${p.sellable} in stock`].filter(Boolean).join(' · ')}</small>
              </Link>
            );
          })}

          {entries.length === 0 ? <p className="pnav-none">{searching ? 'Searching…' : `Nothing called “${query.trim()}”.`}</p> : null}
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
