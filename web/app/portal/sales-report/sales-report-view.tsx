"use client";

/**
 * The sales report: what sold in a day, a week, a month or any dates, what it came to, what money came in, and every order with where it
 * stands, including the cancelled and refunded ones.
 *
 * The figures are worked out by the server (backend/src/sales-report) and mean what they mean on the dashboard and in the daily report:
 * a sale is a paid, packed, shipped or delivered order; unpaid orders and cancelled or refunded ones are shown on their own and never added
 * to revenue. The period and filters are kept in the address, so a view can be bookmarked or sent to someone.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { CollapseCard } from '../components/collapse-card';
import { FollowUpButton, FollowUp } from '../components/follow-up-button';
import { downloadCsv, toCsv } from '../components/list-export';
import { PrintReportButton } from '../components/print-report';
import { useErrorState } from '../components/notifications';
import { ChartFrame, RankedBars } from '../analytics/charts';
import { SalesBars } from './sales-bars';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, formatMoney, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';
import { Mode, addDays, fmt, isDay, monday, monthFirst, spanOf, step, titleOf } from './periods';
import './sales-report.css';

type Split = { key: string; name: string; placed: number; sales: number; revenue: number; unpaid: number; closed: number };
type Report = {
  range: { from: string; to: string; period: Mode };
  comparison: { from: string; to: string; summary: { sales: { revenue: number; count: number }; placed: { count: number }; received: { total: number } }; changes: Record<'revenue' | 'sales' | 'averageOrder' | 'units' | 'received' | 'placed' | 'closed', number | null> };
  summary: {
    placed: { count: number; value: number };
    sales: { count: number; revenue: number; averageOrder: number; units: number; unitsPerSale: number; paid: number; owed: number; owedCount: number };
    unpaid: { count: number; value: number; partPaid: number };
    cancelled: { count: number; value: number };
    refunded: { count: number; value: number };
    cancellationRate: number | null;
    moneyOnClosed: { amount: number; count: number };
    goods: { itemsValue: number; discounts: number; shipping: number; tax: number };
    website: { placed: number; paid: number; paidRate: number | null };
    received: { total: number; fromOrders: number; fromPickups: number; onClosedOrders: number; byMethod: Array<{ method: string; count: number; amount: number }> };
  };
  customers: { unique: number; returning: number; first: number; anonymousSales: number };
  margin: { goodsRevenue: number; cost: number; grossProfit: number; marginPercent: number | null; unitsWithoutCost: number } | null;
  grouping: 'hour' | 'day' | 'week' | 'month';
  series: Array<{ key: string; label: string; from: string; to: string; placed: number; sales: number; revenue: number; units: number; unpaid: number; closed: number; received: number }>;
  breakdowns: {
    byStatus: Array<{ status: string; count: number; value: number }>;
    byChannel: Split[]; byPriceList: Split[]; byStore: Split[]; byStaff: Split[];
    topProducts: Array<{ productId: string; name: string; units: number; revenue: number }>;
    topCustomers: Array<{ name: string; orders: number; revenue: number }>;
  };
  pickupMoneyIncluded: boolean;
  generatedAt: string;
};
type Row = {
  id: string; orderNumber: string; placedAt: string; status: string; channel: string; priceTier: string; storeName: string; customerName: string | null; customerPhone: string | null;
  items: string; units: number; subtotal: number; discount: number; shipping: number; total: number; amountPaid: number; balance: number; paymentMethods: string; createdBy: string;
  cancelledAt: string | null; closeReason: string | null; followUp: FollowUp | null;
};
type OrderPage = { items: Row[]; total: number; skip: number; take: number; sums: { total: number; amountPaid: number } };
type Options = { stores: Array<{ id: string; name: string }>; channels: string[]; staff: string[]; firstOrderDay: string | null; today: string };
type Filters = { storeId: string; channel: string; priceTier: string; staff: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Unpaid', cls: 'portal-chip' }, PAID: { label: 'Paid', cls: 'portal-chip is-success' }, PACKED: { label: 'Packed', cls: 'portal-chip is-success' },
  SHIPPED: { label: 'Shipped', cls: 'portal-chip is-success' }, DELIVERED: { label: 'Delivered', cls: 'portal-chip is-success' },
  CANCELLED: { label: 'Cancelled', cls: 'portal-chip is-danger' }, REFUNDED: { label: 'Refunded', cls: 'portal-chip is-danger' },
};
const CHANNEL: Record<string, string> = { IN_STORE: 'In store', WHATSAPP: 'WhatsApp', PHONE: 'Phone call', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', WEBSITE: 'Website', CONSIGNMENT: 'From a pickup' };
const TIER: Record<string, string> = { RETAIL: 'Retail', RESELLER: 'Reseller', WHOLESALE: 'Wholesale' };
const METHOD: Record<string, string> = { MPESA: 'M-Pesa', CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', PAYSTACK: 'Paystack (online)' };
/** Shillings without ".00": whole amounts are the rule here, and the cents only made the columns wider. */
const money = (v: number) => formatMoney(v).replace(/\.00$/, '');
const channelName = (c: string) => CHANNEL[c] ?? c.replace(/_/g, ' ').toLowerCase();
const methodName = (m: string) => METHOD[m] ?? m;
const staffName = (s: string) => (s === 'storefront' ? 'Website checkout' : s === 'system' ? 'System' : s.split('@')[0]);
const GROUP_NOUN = { hour: 'hour', day: 'day', week: 'week', month: 'month' } as const;
const MODES: Array<[Mode, string]> = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['range', 'Date range']];
const NO_FILTERS: Filters = { storeId: '', channel: '', priceTier: '', staff: '' };

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};

/** The change against the comparison period, in words and an arrow as well as colour. */
function Delta({ value, goodWhen = 'up' }: { value: number | null; goodWhen?: 'up' | 'down' }) {
  if (value === null) return <span className="srp-delta is-flat">Nothing earlier to compare</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="srp-delta is-flat">No change</span>;
  const good = (rounded > 0) === (goodWhen === 'up');
  return <span className={`srp-delta ${good ? 'is-good' : 'is-bad'}`}>{rounded > 0 ? '▲' : '▼'} {Math.abs(rounded).toLocaleString('en-KE')}% {rounded > 0 ? 'up' : 'down'}</span>;
}

function Tile({ label, value, note, delta, onClick }: { label: string; value: React.ReactNode; note?: React.ReactNode; delta?: React.ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="srp-tile-label">{label}</span>
      <span className="srp-tile-value">{value}</span>
      {delta}
      {note ? <span className="srp-tile-note">{note}</span> : null}
    </>
  );
  return onClick ? <button type="button" className="srp-tile" onClick={onClick}>{body}</button> : <div className="srp-tile">{body}</div>;
}

function SplitTable({ heading, rows, name }: { heading: string; rows: Split[]; name: (row: Split) => string }) {
  if (!rows.length) return <p className="portal-muted">No orders in this period.</p>;
  return (
    <div className="srp-table-scroll">
      <table className="srp-table no-stack">
        <thead><tr><th>{heading}</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">Revenue</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}><td>{name(r)}</td><td className="num">{r.placed}</td><td className="num">{r.sales}</td><td className="num">{money(r.revenue)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SalesReportView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [options, setOptions] = useState<Options | null>(null);

  const [mode, setMode] = useState<Mode>('day');
  const [anchor, setAnchor] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [groupBy, setGroupBy] = useState('');

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState('all');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('newest');
  const [take, setTake] = useState(25);
  const [skip, setSkip] = useState(0);
  const [orders, setOrders] = useState<OrderPage | null>(null);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const listRef = useRef<HTMLDivElement | null>(null);
  const reportSeq = useRef(0);
  const listSeq = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  // What the filter boxes offer, and the shop's "today"; then the view named in the address, if any.
  useEffect(() => {
    if (!token) return;
    apiRequest<Options>('/sales-report/options', { method: 'GET' }, token)
      .then((o) => {
        const q = new URLSearchParams(window.location.search);
        const wanted = q.get('view') as Mode | null;
        const from = q.get('from');
        const to = q.get('to');
        const m: Mode = wanted && MODES.some(([k]) => k === wanted) ? wanted : 'day';
        setMode(m);
        setAnchor(isDay(from) ? from : o.today);
        setRangeFrom(m === 'range' && isDay(from) ? from : addDays(o.today, -29));
        setRangeTo(m === 'range' && isDay(to) ? to : o.today);
        setFilters({ storeId: q.get('storeId') ?? '', channel: q.get('channel') ?? '', priceTier: q.get('priceTier') ?? '', staff: q.get('staff') ?? '' });
        if (q.get('show')) setShow(q.get('show')!);
        setOptions(o);
      })
      .catch((e) => setErrorMessage(errorText(e)));
  }, [token, setErrorMessage]);

  const today = options?.today ?? '';
  const span = useMemo(() => (anchor && today ? spanOf(mode, anchor, rangeFrom, rangeTo, today) : null), [mode, anchor, rangeFrom, rangeTo, today]);

  /** The period and filters as the server (and the address bar) read them. */
  const periodQuery = useMemo(() => {
    if (!span) return '';
    const q = new URLSearchParams({ from: span.from, to: span.to, period: mode });
    for (const [key, value] of Object.entries(filters)) if (value) q.set(key, value);
    return q.toString();
  }, [span, mode, filters]);

  useEffect(() => {
    if (!periodQuery || !span) return;
    const address = new URLSearchParams(periodQuery);
    address.delete('period');
    address.set('view', mode);
    if (show !== 'all') address.set('show', show);
    window.history.replaceState(null, '', `/portal/sales-report?${address.toString()}`);
  }, [periodQuery, span, mode, show]);

  useEffect(() => {
    if (!token || !periodQuery) return;
    const seq = ++reportSeq.current;
    setLoading(true);
    apiRequest<Report>(`/sales-report?${periodQuery}${groupBy ? `&groupBy=${groupBy}` : ''}`, { method: 'GET' }, token)
      .then((r) => { if (seq === reportSeq.current) setReport(r); })
      .catch((e) => { if (seq === reportSeq.current) { setReport(null); setErrorMessage(errorText(e)); } })
      .finally(() => { if (seq === reportSeq.current) setLoading(false); });
  }, [token, periodQuery, groupBy, setErrorMessage]);

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setSkip(0); }, [periodQuery, show, term, sort, take]);

  const listQuery = useMemo(() => {
    if (!periodQuery) return '';
    const q = new URLSearchParams(periodQuery);
    q.set('show', show);
    q.set('sort', sort);
    if (term) q.set('search', term);
    return q.toString();
  }, [periodQuery, show, sort, term]);

  useEffect(() => {
    if (!token || !listQuery) return;
    const seq = ++listSeq.current;
    apiRequest<OrderPage>(`/sales-report/orders?${listQuery}&skip=${skip}&take=${take}`, { method: 'GET' }, token)
      .then((p) => { if (seq === listSeq.current) setOrders(p); })
      .catch((e) => { if (seq === listSeq.current) setErrorMessage(errorText(e)); });
  }, [token, listQuery, skip, take, setErrorMessage]);

  const jumpToList = useCallback((tab: string) => {
    setShow(tab);
    window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, []);

  /** Open one bar or row of the breakdown on its own: a day as a day, a week or a month as the dates it covers. */
  function drill(row: Report['series'][number]) {
    if (!report || report.grouping === 'hour') return;
    if (report.grouping === 'day') { setMode('day'); setAnchor(row.from); }
    else { setMode('range'); setRangeFrom(row.from); setRangeTo(row.to); }
    setGroupBy('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function exportOrders() {
    if (!token || !report) return;
    setExporting(true);
    try {
      const data = await apiRequest<{ items: Array<Omit<Row, 'followUp'>>; total: number; truncated: boolean }>(`/sales-report/export?${listQuery}`, { method: 'GET' }, token);
      downloadCsv(toCsv(data.items, [
        { header: 'Order', value: (r) => r.orderNumber },
        { header: 'Placed', value: (r) => new Date(r.placedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }) },
        { header: 'Status', value: (r) => STATUS[r.status]?.label ?? r.status },
        { header: 'Channel', value: (r) => channelName(r.channel) },
        { header: 'Store', value: (r) => r.storeName },
        { header: 'Customer', value: (r) => r.customerName ?? 'Walk-in' },
        { header: 'Phone', value: (r) => r.customerPhone },
        { header: 'Price list', value: (r) => TIER[r.priceTier] ?? r.priceTier },
        { header: 'Items', value: (r) => r.items },
        { header: 'Pairs', value: (r) => r.units },
        { header: 'Items value', value: (r) => r.subtotal },
        { header: 'Discount', value: (r) => r.discount },
        { header: 'Delivery', value: (r) => r.shipping },
        { header: 'Total', value: (r) => r.total },
        { header: 'Paid', value: (r) => r.amountPaid },
        { header: 'Balance', value: (r) => r.balance },
        { header: 'Paid by', value: (r) => r.paymentMethods.split(', ').filter(Boolean).map(methodName).join(', ') },
        { header: 'Keyed by', value: (r) => staffName(r.createdBy) },
        { header: 'Cancelled', value: (r) => (r.cancelledAt ? new Date(r.cancelledAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }) : '') },
        { header: 'Reason', value: (r) => r.closeReason },
      ]), `sales-orders_${report.range.from}_to_${report.range.to}${show === 'all' ? '' : `_${show.toLowerCase()}`}.csv`);
      if (data.truncated) setErrorMessage(`The file holds the first ${data.items.length} of ${data.total} orders. Choose a shorter period for the rest.`);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setExporting(false);
    }
  }

  function exportPeriods() {
    if (!report) return;
    downloadCsv(toCsv(report.series, [
      { header: report.grouping === 'hour' ? 'Hour' : 'From', value: (r) => (report.grouping === 'hour' ? r.label : r.from) },
      { header: 'To', value: (r) => r.to },
      { header: 'Orders placed', value: (r) => r.placed },
      { header: 'Sales', value: (r) => r.sales },
      { header: 'Revenue', value: (r) => r.revenue },
      { header: 'Pairs sold', value: (r) => r.units },
      { header: 'Unpaid orders', value: (r) => r.unpaid },
      { header: 'Cancelled or refunded', value: (r) => r.closed },
      { header: 'Money received', value: (r) => r.received },
    ]), `sales-by-${report.grouping}_${report.range.from}_to_${report.range.to}.csv`);
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || (token && !profile)) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card portal-loading">Loading...</article>
      </section></main></EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card">
          <h2>Authentication required</h2>
          <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link>
        </article>
      </section></main></EliteLayout>
    );
  }

  const canRead = hasPermission(profile, 'order.read');
  const s = report?.summary;
  const change = report?.comparison.changes;
  const closedCount = s ? s.cancelled.count + s.refunded.count : 0;
  const nextDisabled = !span || mode === 'range' || spanOf(mode, step(mode, anchor, 1), rangeFrom, rangeTo, today).from > today;
  const nowName = mode === 'day' ? 'Today' : mode === 'week' ? 'This week' : 'This month';
  const compared = report ? (report.comparison.from === report.comparison.to ? fmt(report.comparison.from) : `${fmt(report.comparison.from, { day: 'numeric', month: 'short' })} – ${fmt(report.comparison.to)}`) : '';
  const bars = report?.series.map((r) => ({
    key: r.key, label: r.label, revenue: r.revenue, sales: r.sales,
    short: report.grouping === 'hour' ? r.label : report.grouping === 'month' ? r.label : fmt(r.from, { day: 'numeric', month: 'short' }),
  })) ?? [];
  const tabs: Array<[string, string, number]> = s
    ? [['all', 'All orders', s.placed.count], ['sales', 'Sales', s.sales.count], ['unpaid', 'Unpaid', s.unpaid.count], ['cancelled', 'Cancelled & refunded', closedCount]]
    : [];
  const filtered = Object.values(filters).filter(Boolean).length;
  const quickRanges: Array<[string, string]> = today
    ? [['Last 7 days', addDays(today, -6)], ['Last 30 days', addDays(today, -29)], ['Last 90 days', addDays(today, -89)], ['This year', `${today.slice(0, 4)}-01-01`], ...(options?.firstOrderDay && options.firstOrderDay >= addDays(today, -799) ? [['All time', options.firstOrderDay] as [string, string]] : [])]
    : [];

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="salesReport"
            pageTitle="Sales Report"
            pageSubtitle="What sold, what came in, and where every order stands."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {!canRead ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role cannot see orders.</p></article>
            ) : !options || !span ? (
              <article className="portal-card portal-loading">Loading...</article>
            ) : (
              <>
                <article className="portal-card">
                  <div className="srp-bar no-print">
                    <div className="srp-seg" role="group" aria-label="Kind of period">
                      {MODES.map(([key, label]) => (
                        <button key={key} type="button" className={mode === key ? 'is-on' : ''} aria-pressed={mode === key} onClick={() => { setMode(key); setGroupBy(''); if (key !== 'range') setAnchor(today); }}>{label}</button>
                      ))}
                    </div>
                    {mode === 'range' ? (
                      <div className="srp-stepper">
                        <input type="date" aria-label="From" value={rangeFrom} max={today} onChange={(e) => { if (e.target.value) setRangeFrom(e.target.value); }} />
                        <span>to</span>
                        <input type="date" aria-label="To" value={rangeTo} max={today} onChange={(e) => { if (e.target.value) setRangeTo(e.target.value); }} />
                      </div>
                    ) : (
                      <div className="srp-stepper">
                        <button type="button" className="srp-arrow" aria-label="Earlier" onClick={() => setAnchor(step(mode, anchor, -1))}>‹</button>
                        {mode === 'month' ? (
                          <input type="month" aria-label="Month" value={anchor.slice(0, 7)} max={today.slice(0, 7)} onChange={(e) => { if (e.target.value) setAnchor(`${e.target.value}-01`); }} />
                        ) : (
                          <input type="date" aria-label={mode === 'week' ? 'Any day in the week' : 'Day'} value={mode === 'week' ? monday(anchor) : anchor} max={today} onChange={(e) => { if (e.target.value) setAnchor(e.target.value); }} />
                        )}
                        <button type="button" className="srp-arrow" aria-label="Later" disabled={nextDisabled} onClick={() => setAnchor(step(mode, anchor, 1))}>›</button>
                        <button type="button" className="portal-inline-btn" onClick={() => setAnchor(today)} disabled={mode === 'day' ? anchor === today : mode === 'week' ? monday(anchor) === monday(today) : monthFirst(anchor) === monthFirst(today)}>{nowName}</button>
                      </div>
                    )}
                  </div>
                  {mode === 'range' ? (
                    <div className="srp-presets no-print" style={{ marginTop: 10 }}>
                      {quickRanges.map(([label, from]) => (
                        <button key={label} type="button" className="portal-inline-btn" onClick={() => { setRangeFrom(from); setRangeTo(today); setGroupBy(''); }}>{label}</button>
                      ))}
                    </div>
                  ) : null}
                  <div className="portal-entity-form no-print" style={{ marginTop: 12 }}>
                    <div className="srp-filters">
                      <label><span>Store</span>
                        <select value={filters.storeId} onChange={(e) => setFilters({ ...filters, storeId: e.target.value })}>
                          <option value="">All stores</option>
                          {options.stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                        </select>
                      </label>
                      <label><span>Channel</span>
                        <select value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
                          <option value="">All channels</option>
                          {options.channels.map((c) => <option key={c} value={c}>{channelName(c)}</option>)}
                        </select>
                      </label>
                      <label><span>Price list</span>
                        <select value={filters.priceTier} onChange={(e) => setFilters({ ...filters, priceTier: e.target.value })}>
                          <option value="">All price lists</option>
                          {Object.entries(TIER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </label>
                      <label><span>Keyed by</span>
                        <select value={filters.staff} onChange={(e) => setFilters({ ...filters, staff: e.target.value })}>
                          <option value="">Anyone</option>
                          {options.staff.map((who) => <option key={who} value={who}>{staffName(who)}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <h2 className="srp-title" aria-live="polite">{titleOf(mode, span.from, span.to, today)}</h2>
                  <p className="portal-muted srp-compared">
                    {report ? `Changes are against ${compared}${mode === 'day' && span.from === today ? ' (the whole of that day)' : ''}.` : 'Working it out…'}
                    {filtered ? ` ${filtered} filter${filtered === 1 ? '' : 's'} on.` : ''}{loading && report ? ' Updating…' : ''}
                    {filtered ? <> <button type="button" className="srp-link no-print" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button></> : null}
                  </p>
                  <p className="portal-muted srp-print-only">
                    {[filters.storeId && `Store: ${options.stores.find((st) => st.id === filters.storeId)?.name}`, filters.channel && `Channel: ${channelName(filters.channel)}`, filters.priceTier && `Price list: ${TIER[filters.priceTier]}`, filters.staff && `Keyed by: ${staffName(filters.staff)}`].filter(Boolean).join(' · ')}
                    {report ? ` Printed ${formatDateTime(report.generatedAt)}.` : ''}
                  </p>
                  <div className="srp-presets no-print" style={{ marginTop: 10 }}>
                    <PrintReportButton label="Print or save as PDF" documentTitle={`Drip Emporium sales ${span.from} to ${span.to}`} />
                  </div>
                </article>

                {!report || !s || !change ? (
                  <article className="portal-card portal-loading">Loading the figures…</article>
                ) : (
                  <>
                    <div className="srp-tiles">
                      <Tile label="Revenue" value={money(s.sales.revenue)} delta={<Delta value={change.revenue} />} note={`was ${money(report.comparison.summary.sales.revenue)}`} />
                      <Tile label="Sales" value={s.sales.count} delta={<Delta value={change.sales} />} note="paid, packed, shipped or delivered" onClick={() => jumpToList('sales')} />
                      <Tile label="Average sale" value={money(s.sales.averageOrder)} delta={<Delta value={change.averageOrder} />} note={`Pairs per sale: ${s.sales.unitsPerSale}`} />
                      <Tile label="Pairs sold" value={s.sales.units} delta={<Delta value={change.units} />} />
                      <Tile label="Money received" value={money(s.received.total)} delta={<Delta value={change.received} />} note="payments that came in, whenever ordered" />
                      <Tile label="Orders placed" value={s.placed.count} delta={<Delta value={change.placed} />} note={`${money(s.placed.value)} including unpaid and cancelled`} onClick={() => jumpToList('all')} />
                      <Tile label="Cancelled & refunded" value={closedCount} delta={<Delta value={change.closed} goodWhen="down" />} note={`${money(s.cancelled.value + s.refunded.value)}${s.cancellationRate !== null ? ` · ${s.cancellationRate}% of orders` : ''}`} onClick={() => jumpToList('cancelled')} />
                      <Tile label="Unpaid" value={s.unpaid.count} note={`${money(s.unpaid.value)} not counted as sales`} onClick={() => jumpToList('unpaid')} />
                    </div>

                    {s.unpaid.count || s.sales.owedCount || s.moneyOnClosed.count ? (
                      <div className="srp-alerts no-print">
                        {s.unpaid.count ? (
                          <div className="srp-alert"><span><strong>{s.unpaid.count} unpaid order{s.unpaid.count === 1 ? '' : 's'}</strong> worth {money(s.unpaid.value)}. A message while they are still keen may close them.</span>
                            <button type="button" className="portal-inline-btn" onClick={() => jumpToList('unpaid')}>Chase them</button></div>
                        ) : null}
                        {s.sales.owedCount ? (
                          <div className="srp-alert"><span><strong>{money(s.sales.owed)} is not recorded as paid</strong> on {s.sales.owedCount} sale{s.sales.owedCount === 1 ? '' : 's'}. Collect it, or record the payment on the order.</span>
                            <button type="button" className="portal-inline-btn" onClick={() => jumpToList('sales')}>See sales</button></div>
                        ) : null}
                        {s.moneyOnClosed.count ? (
                          <div className="srp-alert"><span><strong>{money(s.moneyOnClosed.amount)} was paid</strong> on {s.moneyOnClosed.count} order{s.moneyOnClosed.count === 1 ? '' : 's'} later cancelled or refunded. Check it went back to the customer.</span>
                            <button type="button" className="portal-inline-btn" onClick={() => jumpToList('cancelled')}>See them</button></div>
                        ) : null}
                      </div>
                    ) : null}

                    <ChartFrame
                      title={`Revenue by ${GROUP_NOUN[report.grouping]}`}
                      subtitle="Sales only, by the day the order was placed"
                      table={{ headers: ['Period', 'Sales', 'Revenue'], rows: report.series.map((r) => [r.label, r.sales, money(r.revenue)]) }}
                    >
                      {s.sales.count === 0 ? <p className="chart-empty">No sales in this period.</p>
                        : <SalesBars data={bars} onPick={report.grouping === 'hour' ? undefined : (key) => { const row = report.series.find((r) => r.key === key); if (row) drill(row); }} />}
                    </ChartFrame>

                    <CollapseCard title={report.grouping === 'hour' ? 'Hour by hour' : report.grouping === 'day' ? 'Day by day' : report.grouping === 'week' ? 'Week by week' : 'Month by month'} summary={`${report.series.filter((r) => r.placed || r.received).length} with activity`} defaultOpen={report.grouping !== 'hour'}>
                      <div className="srp-listbar no-print">
                        {span.from !== span.to ? (
                          <label>Break down by{' '}
                            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                              <option value="">Automatic ({GROUP_NOUN[report.grouping]})</option>
                              <option value="day">Day</option>
                              <option value="week">Week</option>
                              <option value="month">Month</option>
                            </select>
                          </label>
                        ) : null}
                        <button type="button" className="portal-inline-btn" onClick={exportPeriods}>Export CSV</button>
                      </div>
                      <div className="srp-table-scroll">
                        <table className="srp-table srp-periods no-stack">
                          <thead><tr><th>Period</th><th className="num srp-opt">Orders</th><th className="num">Sales</th><th className="num">Revenue</th><th className="num srp-opt">Unpaid</th><th className="num srp-opt">Cancelled</th><th className="num">Received</th></tr></thead>
                          <tbody>
                            {report.series.filter((r) => report.grouping !== 'hour' || r.placed || r.received).map((r) => (
                              <tr key={r.key}>
                                <td>{report.grouping === 'hour' ? r.label : <button type="button" className="srp-link" onClick={() => drill(r)} title="Open this period on its own">{r.label}</button>}</td>
                                <td className="num srp-opt">{r.placed}</td><td className="num">{r.sales}</td><td className="num">{money(r.revenue)}</td>
                                <td className="num srp-opt">{r.unpaid}</td><td className="num srp-opt">{r.closed}</td><td className="num">{money(r.received)}</td>
                              </tr>
                            ))}
                            <tr className="is-total">
                              <td>Total</td><td className="num srp-opt">{s.placed.count}</td><td className="num">{s.sales.count}</td><td className="num">{money(s.sales.revenue)}</td>
                              <td className="num srp-opt">{s.unpaid.count}</td><td className="num srp-opt">{closedCount}</td><td className="num">{money(s.received.total)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CollapseCard>

                    <div className="srp-grid">
                      <CollapseCard title="Money received" summary={money(s.received.total)} defaultOpen>
                        <p className="portal-muted" style={{ marginTop: 0 }}>For checking against the till, the M-Pesa statement and Paystack. Counted on the day the payment was recorded.</p>
                        {s.received.byMethod.length ? (
                          <table className="srp-table no-stack">
                            <thead><tr><th>Paid by</th><th className="num">Payments</th><th className="num">Amount</th></tr></thead>
                            <tbody>
                              {s.received.byMethod.map((m) => <tr key={m.method}><td>{methodName(m.method)}</td><td className="num">{m.count}</td><td className="num">{money(m.amount)}</td></tr>)}
                              <tr className="is-total"><td>Total</td><td className="num">{s.received.byMethod.reduce((n, m) => n + m.count, 0)}</td><td className="num">{money(s.received.total)}</td></tr>
                            </tbody>
                          </table>
                        ) : <p className="portal-muted">No payments recorded in this period.</p>}
                        <ul className="portal-muted" style={{ paddingLeft: 18, marginBottom: 0 }}>
                          {s.received.fromPickups ? <li>{money(s.received.fromPickups)} of this came from reseller pickups.</li> : null}
                          {s.received.onClosedOrders ? <li>{money(s.received.onClosedOrders)} was taken on orders now cancelled or refunded.</li> : null}
                          {!report.pickupMoneyIncluded ? <li>Pickup payments are left out while a channel or “keyed by” filter is on.</li> : null}
                        </ul>
                      </CollapseCard>

                      <CollapseCard title="How the revenue adds up" summary={money(s.sales.revenue)} defaultOpen>
                        <table className="srp-table no-stack">
                          <tbody>
                            <tr><td>Items sold</td><td className="num">{money(s.goods.itemsValue)}</td></tr>
                            <tr><td>Delivery charged</td><td className="num">{money(s.goods.shipping)}</td></tr>
                            {s.goods.tax ? <tr><td>Tax</td><td className="num">{money(s.goods.tax)}</td></tr> : null}
                            <tr className="is-total"><td>Revenue</td><td className="num">{money(s.sales.revenue)}</td></tr>
                            <tr><td>Discounts given on these sales</td><td className="num">{money(s.goods.discounts)}</td></tr>
                            <tr><td>Paid so far on these sales</td><td className="num">{money(s.sales.paid)}</td></tr>
                            <tr><td>Not recorded as paid</td><td className="num">{money(s.sales.owed)}</td></tr>
                            {report.margin ? (
                              <>
                                <tr><td>Cost of the goods</td><td className="num">{money(report.margin.cost)}</td></tr>
                                <tr className="is-total"><td>Gross profit (estimate)</td><td className="num">{money(report.margin.grossProfit)}{report.margin.marginPercent !== null ? ` · ${report.margin.marginPercent}%` : ''}</td></tr>
                              </>
                            ) : null}
                          </tbody>
                        </table>
                        {report.margin ? <p className="portal-muted" style={{ marginBottom: 0 }}>Profit is sales less delivery and tax, less each product’s buying price. {report.margin.unitsWithoutCost ? `${report.margin.unitsWithoutCost} pair(s) sold have no buying price, so profit reads high.` : ''}</p> : null}
                      </CollapseCard>

                      <CollapseCard title="Orders by status" summary={`${s.placed.count}`}>
                        {report.breakdowns.byStatus.length ? (
                          <table className="srp-table no-stack">
                            <thead><tr><th>Status</th><th className="num">Orders</th><th className="num">Value</th></tr></thead>
                            <tbody>
                              {Object.keys(STATUS).map((key) => report.breakdowns.byStatus.find((r) => r.status === key)).filter((r): r is { status: string; count: number; value: number } => Boolean(r)).map((r) => (
                                <tr key={r.status}><td><button type="button" className="srp-link" onClick={() => jumpToList(r.status)}>{STATUS[r.status].label}</button></td><td className="num">{r.count}</td><td className="num">{money(r.value)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        ) : <p className="portal-muted">No orders in this period.</p>}
                      </CollapseCard>

                      <CollapseCard title="Customers" summary={`${report.customers.unique} buyers`}>
                        <table className="srp-table no-stack">
                          <tbody>
                            <tr><td>Different buyers</td><td className="num">{report.customers.unique}</td></tr>
                            <tr><td>Buying for the first time</td><td className="num">{report.customers.first}</td></tr>
                            <tr><td>Had bought before</td><td className="num">{report.customers.returning}</td></tr>
                            <tr><td>Walk-in sales with no name or number</td><td className="num">{report.customers.anonymousSales}</td></tr>
                            <tr><td>Website orders that were paid for</td><td className="num">{s.website.paidRate === null ? '—' : `${s.website.paid} of ${s.website.placed} (${s.website.paidRate}%)`}</td></tr>
                          </tbody>
                        </table>
                      </CollapseCard>

                      <CollapseCard title="By channel" summary={`${report.breakdowns.byChannel.length}`}>
                        <SplitTable heading="Channel" rows={report.breakdowns.byChannel} name={(r) => channelName(r.key)} />
                      </CollapseCard>
                      <CollapseCard title="By staff" summary={`${report.breakdowns.byStaff.length}`}>
                        <SplitTable heading="Keyed by" rows={report.breakdowns.byStaff} name={(r) => staffName(r.key)} />
                      </CollapseCard>
                      <CollapseCard title="By price list" summary={`${report.breakdowns.byPriceList.length}`}>
                        <SplitTable heading="Price list" rows={report.breakdowns.byPriceList} name={(r) => TIER[r.key] ?? r.key} />
                      </CollapseCard>
                      <CollapseCard title="By store" summary={`${report.breakdowns.byStore.length}`}>
                        <SplitTable heading="Store" rows={report.breakdowns.byStore} name={(r) => r.name} />
                      </CollapseCard>
                      <CollapseCard title="Top products" summary={`${report.breakdowns.topProducts.length}`}>
                        <RankedBars data={report.breakdowns.topProducts.map((p) => ({ label: p.name, value: p.revenue, sublabel: `${p.units} pair${p.units === 1 ? '' : 's'}` }))} valueFormat={(v) => money(v)} />
                      </CollapseCard>
                      <CollapseCard title="Top customers" summary={`${report.breakdowns.topCustomers.length}`}>
                        {report.breakdowns.topCustomers.length ? (
                          <table className="srp-table no-stack">
                            <thead><tr><th>Customer</th><th className="num">Sales</th><th className="num">Revenue</th></tr></thead>
                            <tbody>{report.breakdowns.topCustomers.map((c, i) => <tr key={`${c.name}-${i}`}><td>{c.name}</td><td className="num">{c.orders}</td><td className="num">{money(c.revenue)}</td></tr>)}</tbody>
                          </table>
                        ) : <p className="portal-muted">No named buyers in this period.</p>}
                      </CollapseCard>
                    </div>
                  </>
                )}

                <div ref={listRef} style={{ scrollMarginTop: 70 }}>
                  <article className="portal-card">
                    <h2 style={{ marginTop: 0 }}>Orders in this period</h2>
                    <div className="srp-tabs no-print" role="group" aria-label="Which orders">
                      {tabs.map(([key, label, count]) => <button key={key} type="button" className={show === key ? 'is-on' : ''} aria-pressed={show === key} onClick={() => setShow(key)}>{label} ({count})</button>)}
                    </div>
                    <div className="srp-listbar no-print">
                      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number, name or phone…" aria-label="Search orders" />
                      <select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Status">
                        <option value="all">Any status</option>
                        <option value="sales">All sales</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="cancelled">Cancelled &amp; refunded</option>
                        {Object.entries(STATUS).filter(([k]) => k !== 'PENDING').map(([k, v]) => <option key={k} value={k}>{v.label} only</option>)}
                      </select>
                      <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="largest">Largest first</option>
                        <option value="smallest">Smallest first</option>
                      </select>
                      <button type="button" className="portal-inline-btn" disabled={exporting || !orders?.total} onClick={() => void exportOrders()}>{exporting ? 'Preparing…' : 'Export orders CSV'}</button>
                    </div>
                    {!orders ? <p className="portal-muted">Loading…</p> : orders.items.length === 0 ? (
                      <div className="portal-empty-state">{term ? 'No orders match that search.' : 'No orders here for this period.'}</div>
                    ) : (
                      <>
                        <p className="portal-muted" style={{ marginTop: 0 }}>{orders.total} order{orders.total === 1 ? '' : 's'} · {money(orders.sums.total)} in total · {money(orders.sums.amountPaid)} paid</p>
                        <div className="portal-table-wrap">
                          <table className="portal-data-table srp-orders">
                            <thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Customer</th><th>Channel</th><th>Items</th><th className="portal-num">Total</th><th className="portal-num">Paid</th><th className="portal-num">Balance</th><th></th></tr></thead>
                            <tbody>
                              {orders.items.map((o) => (
                                <tr key={o.id}>
                                  <td><Link href={`/portal/orders/${o.id}`}>{o.orderNumber}</Link></td>
                                  <td>{formatDateTime(o.placedAt)}</td>
                                  <td>
                                    <span className={STATUS[o.status]?.cls ?? 'portal-chip'}>{STATUS[o.status]?.label ?? o.status}</span>
                                    {o.status === 'CANCELLED' && o.cancelledAt ? <span className="srp-reason">on {formatDateTime(o.cancelledAt)}</span> : null}
                                    {o.closeReason ? <span className="srp-reason">{o.closeReason}</span> : null}
                                  </td>
                                  <td>{o.customerName || 'Walk-in'}{o.customerPhone ? <span className="srp-reason">{o.customerPhone}</span> : null}</td>
                                  <td>{channelName(o.channel)}<span className="srp-reason">{staffName(o.createdBy)}</span></td>
                                  <td>{o.items}</td>
                                  <td className="portal-num">{money(o.total)}</td>
                                  <td className="portal-num">{money(o.amountPaid)}{o.paymentMethods ? <span className="srp-reason">{o.paymentMethods.split(', ').map(methodName).join(', ')}</span> : null}</td>
                                  <td className="portal-num">{o.balance > 0 ? money(o.balance) : '—'}</td>
                                  <td className="no-print">{o.followUp ? <FollowUpButton followUp={o.followUp}>Message</FollowUpButton> : null}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="srp-pager no-print">
                          <span className="portal-muted">Showing {orders.skip + 1}–{orders.skip + orders.items.length} of {orders.total}</span>
                          <label className="portal-muted">Per page{' '}
                            <select value={take} onChange={(e) => setTake(Number(e.target.value))}>{[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                          </label>
                          <span style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="portal-inline-btn" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))}>Previous</button>
                            <button type="button" className="portal-inline-btn" disabled={skip + take >= orders.total} onClick={() => setSkip(skip + take)}>Next</button>
                          </span>
                        </div>
                      </>
                    )}
                  </article>
                </div>
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
