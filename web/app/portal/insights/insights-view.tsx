"use client";

/**
 * Insights: what the storefront's visitors did, and what it means for ads, stock and customers.
 *
 * Analytics (the screen beside this one) answers "how much did we make, and where". Insights answers the questions that come
 * before and after it: which ads are worth their money, which pairs are sitting on the shelf, which sold-out pairs people
 * still ask for, and who has stopped coming back. It reads the shop's own record of visits (see insights/events.service),
 * so it includes the sales that close in WhatsApp, which the ad platforms never see.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, hasPermission, loadProfile, roleLabelFor } from '../accounting/lib';

type Row = { sessions: number; viewedProduct: number; addedToCart: number; beganCheckout: number; tappedWhatsapp: number; whatsappOrders: number; orders: number; revenueKes: number };
type Funnel = {
  totals: Row;
  adReturn: Array<{ source: string; spendKes: number; visits: number; whatsappTaps: number; orders: number; revenueKes: number }>;
  bySource: Array<Row & { source: string; medium: string }>;
  byDevice: Array<Row & { device: string }>;
  products: Array<{ slug: string; name: string; line: string | null; views: number; addedToCart: number; tappedWhatsapp: number; unitsSold: number }>;
  searches: Array<{ term: string; searches: number }>;
  orders: { placed: number; placedKes: number; linkedToVisits: number };
};
type Stock = {
  deadDays: number;
  onHand: { units: number; retailValueKes: number; costValueKes: number; productsWithoutCost: number };
  deadStock: { count: number; tiedUpKes: number; items: Array<{ slug: string; name: string; line: string; units: number; valueKes: number; basis: 'cost' | 'price' | 'mixed'; daysSinceSale: number | null; onShelfDays: number }> };
  runningLow: Array<{ slug: string; name: string; units: number; soldInPeriod: number; coverDays: number | null }>;
  missedDemand: Array<{ slug: string; name: string; line: string; views: number; carts: number; whatsapp: number }>;
};
type Buyers = {
  lapseDays: number; buyers: number; newBuyers: number; returningBuyers: number; repeatRate: number; repeatRevenueShare: number;
  averageOrderKes: number; averageLifetimeKes: number; averageOrdersPerBuyer: number; unrecognisedOrders: number;
  lapsed: Array<{ name: string; phone: string | null; orders: number; spendKes: number; lastOrder: string; daysAgo: number }>; lapsedCount: number;
};
type SpendEntry = { id: string; day: string; source: string; campaign: string | null; amountKes: number; note: string | null };

const kes = (n: number | null | undefined) => `KES ${Math.round(n ?? 0).toLocaleString('en-KE')}`;
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : '–');
const rate = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};

/** What each stage of a visit lost, in words, so the screen says what to look at rather than leaving the reading to staff. */
function funnelNotes(f: Funnel): string[] {
  const t = f.totals;
  if (t.sessions < 30) return [];
  const out: string[] = [];
  const left = 1 - t.viewedProduct / t.sessions;
  if (left > 0.6) out.push(`${(left * 100).toFixed(0)}% of visits leave without opening a single product. The first screen, the ad's promise and the page the ad lands on are worth a look.`);
  if (t.viewedProduct >= 20 && t.addedToCart / t.viewedProduct < 0.05 && t.tappedWhatsapp / t.viewedProduct < 0.05) {
    out.push(`Of ${t.viewedProduct} visits that opened a product, only ${t.addedToCart} added to cart and ${t.tappedWhatsapp} tapped WhatsApp. The product page is where people hesitate: price, sizes, delivery and trust.`);
  }
  if (t.addedToCart >= 10 && t.beganCheckout / t.addedToCart < 0.3) out.push(`${t.addedToCart - t.beganCheckout} of ${t.addedToCart} carts never reached checkout.`);
  const mobile = f.byDevice.find((d) => d.device === 'mobile');
  const desktop = f.byDevice.find((d) => d.device === 'desktop');
  if (mobile && desktop && mobile.sessions >= 30 && desktop.sessions >= 30) {
    const m = (mobile.orders + mobile.tappedWhatsapp) / mobile.sessions;
    const d = (desktop.orders + desktop.tappedWhatsapp) / desktop.sessions;
    if (m < d * 0.6) out.push(`Phones bring ${pct(mobile.sessions, t.sessions)} of visits but convert far worse than desktop. Check the phone experience first.`);
  }
  const worst = f.bySource.find((s) => s.sessions >= 30 && s.orders === 0 && s.tappedWhatsapp === 0 && !['organic', 'none'].includes(s.medium));
  if (worst) out.push(`${worst.source} (${worst.medium}) sent ${worst.sessions} visits and produced no orders and no WhatsApp taps.`);
  return out;
}

function winBackLink(phone: string, name: string) {
  const first = name.split(' ')[0] || 'there';
  const text = `Hi ${first}, it has been a while since your last order at Drip Emporium. New pairs have landed, would you like to see what's in?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function InsightsView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<'visits' | 'whatsapp' | 'stock' | 'customers'>('visits');

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  const from = iso(new Date(Date.now() - days * 24 * 3600_000));
  const to = iso(new Date());

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || (token && !profile)) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card portal-loading">Loading insights...</article>
        </section></main>
      </EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card">
            <h2>Authentication required</h2>
            <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link>
          </article>
        </section></main>
      </EliteLayout>
    );
  }

  const can = {
    visits: hasPermission(profile, 'marketing-campaign.read'),
    whatsapp: hasPermission(profile, 'marketing-campaign.read'),
    stock: hasPermission(profile, 'journal-entry.read'),
    customers: hasPermission(profile, 'customer.read'),
  };
  const tabs = ([['visits', 'Visits & ads'], ['whatsapp', 'WhatsApp'], ['stock', 'Products & stock'], ['customers', 'Customers']] as const).filter(([key]) => can[key]);
  const active = can[tab] ? tab : tabs[0]?.[0];

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="insights"
            pageTitle="Insights"
            pageSubtitle="Which ads are worth their money, which pairs are sitting on the shelf, which sold-out pairs people still ask for, and who has stopped coming back."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {tabs.length === 0 ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role does not include any of the reports on this screen.</p></article>
            ) : (
              <>
                <div className="portal-card-header-row" style={{ marginBottom: 16 }}>
                  <div className="portal-tabs">
                    {tabs.map(([key, label]) => (
                      <button key={key} type="button" className={active === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>
                    ))}
                  </div>
                  <label className="portal-muted">
                    Period{' '}
                    <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                      {[7, 30, 90, 180].map((d) => <option key={d} value={d}>Last {d} days</option>)}
                    </select>
                  </label>
                </div>
                {active === 'visits' ? <VisitsTab token={token} profile={profile} from={from} to={to} /> : null}
                {active === 'whatsapp' ? <WhatsappTab token={token} from={from} to={to} /> : null}
                {active === 'stock' ? <StockTab token={token} from={from} to={to} /> : null}
                {active === 'customers' ? <CustomersTab token={token} from={from} to={to} /> : null}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}

function useReport<T>(path: string, token: string): T | null | undefined {
  // undefined while loading, null when it failed or is not allowed, the data otherwise.
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    apiRequest<T>(path, { method: 'GET' }, token).then((v) => { if (!cancelled) setData(v); }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [path, token]);
  return data;
}

function VisitsTab({ token, profile, from, to }: { token: string; profile: AuthProfile; from: string; to: string }) {
  const [version, setVersion] = useState(0);
  const f = useReport<Funnel>(`/insights/funnel?from=${from}&to=${to}&v=${version}`, token);
  if (f === undefined) return <article className="portal-card"><p className="portal-muted">Loading...</p></article>;
  if (f === null) return <article className="portal-card portal-error">Could not load the visit report.</article>;

  const t = f.totals;
  const steps = [
    { label: 'Visits', value: t.sessions }, { label: 'Opened a product', value: t.viewedProduct }, { label: 'Added to cart', value: t.addedToCart },
    { label: 'Began checkout', value: t.beganCheckout }, { label: 'Tapped WhatsApp', value: t.tappedWhatsapp }, { label: 'Ordered', value: t.orders },
  ];
  const notes = funnelNotes(f);

  return (
    <>
      <article className="portal-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Visits to orders</h2>
        {t.sessions === 0 ? (
          <p className="portal-muted">No visits recorded in this period yet. Visits are counted from the day this was switched on, so numbers appear as shoppers arrive.</p>
        ) : (
          <>
            <div className="portal-stat-grid">
              {steps.map((s) => (
                <div key={s.label} className="portal-stat">
                  <span>{s.label}</span>
                  <h3>{s.value.toLocaleString('en-KE')}</h3>
                  <span className="portal-stat-note">{s.label === 'Visits' ? 'Every browser that arrived' : `${pct(s.value, t.sessions)} of visits`}</span>
                </div>
              ))}
            </div>
            <p className="portal-muted" style={{ marginBottom: 0 }}>
              Visit to order: <strong>{pct(t.orders, t.sessions)}</strong>. Visit to an order or a WhatsApp tap: <strong>{pct(t.orders + t.tappedWhatsapp, t.sessions)}</strong>.
              {f.orders.placed > 0 ? ` ${f.orders.linkedToVisits} of the ${f.orders.placed} orders placed in this period can be traced to a visit; the rest were taken in store, by phone, or before tracking began.` : ''}
            </p>
            {notes.length ? <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
          </>
        )}
      </article>

      <article className="portal-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>What ads return</h2>
        {f.adReturn.length === 0 ? (
          <p className="portal-muted">Enter what you spend on ads below to see what each platform costs per order and what it brings back.</p>
        ) : (
          <div className="portal-table-wrap">
            <table className="portal-data-table">
              <thead><tr><th>Platform</th><th>Spent</th><th>Visits</th><th>Cost per visit</th><th>WhatsApp taps</th><th>Orders</th><th>Cost per order</th><th>Sales</th><th>Sales per KES 1</th></tr></thead>
              <tbody>
                {f.adReturn.map((a) => (
                  <tr key={a.source}>
                    <td><strong>{a.source}</strong></td><td>{kes(a.spendKes)}</td><td>{a.visits}</td>
                    <td>{a.visits ? kes(a.spendKes / a.visits) : '–'}</td>
                    <td>{a.whatsappTaps}{a.whatsappTaps > 0 ? ` (${kes(a.spendKes / a.whatsappTaps)} each)` : ''}</td>
                    <td>{a.orders}</td><td>{a.orders ? kes(a.spendKes / a.orders) : '–'}</td>
                    <td>{kes(a.revenueKes)}</td><td>{a.spendKes > 0 ? (a.revenueKes / a.spendKes).toFixed(1) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="portal-muted" style={{ fontSize: 13 }}>
          Counts visits from tagged ads and ad click ids only. Orders agreed in store or by phone, or by someone who came back later another way, are not counted, so treat these as the least the ads returned.
        </p>
        <AdSpendForm token={token} profile={profile} from={from} to={to} onChanged={() => setVersion((v) => v + 1)} />
      </article>

      {t.sessions > 0 ? (
        <>
          <article className="portal-card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginTop: 0 }}>Where visits come from</h2>
            <div className="portal-table-wrap">
              <table className="portal-data-table">
                <thead><tr><th>Source</th><th>Kind</th><th>Visits</th><th>Opened a product</th><th>Added to cart</th><th>WhatsApp taps</th><th>Orders</th><th>Revenue</th><th>Visit to order</th></tr></thead>
                <tbody>
                  {f.bySource.map((s) => (
                    <tr key={`${s.source}|${s.medium}`}>
                      <td><strong>{s.source}</strong></td><td>{s.medium}</td><td>{s.sessions.toLocaleString('en-KE')}</td>
                      <td>{pct(s.viewedProduct, s.sessions)}</td><td>{pct(s.addedToCart, s.sessions)}</td><td>{s.tappedWhatsapp}</td>
                      <td>{s.orders}</td><td>{kes(s.revenueKes)}</td><td>{pct(s.orders, s.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="portal-muted" style={{ fontSize: 13, marginBottom: 0 }}>
              Tag each ad link with <code>?utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign=name</code> to see campaigns by name. Ads from Facebook, Instagram, TikTok and Google are recognised even without tags. Campaign and reseller links (<code>?camp=</code>, <code>?ref=</code>) keep their own reporting under Campaigns.
            </p>
          </article>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Products people look at</h2>
              {f.products.length === 0 ? <p className="portal-muted">No product views yet.</p> : (
                <div className="portal-table-wrap">
                  <table className="portal-data-table">
                    <thead><tr><th>Product</th><th>Views</th><th>Carts</th><th>WhatsApp</th><th>Sold</th></tr></thead>
                    <tbody>
                      {f.products.slice(0, 10).map((p) => (
                        <tr key={p.slug}>
                          <td>{p.name}{p.views >= 20 && p.addedToCart + p.tappedWhatsapp + p.unitsSold === 0 ? <span className="portal-muted"> · looked at, never wanted</span> : null}</td>
                          <td>{p.views}</td><td>{p.addedToCart}</td><td>{p.tappedWhatsapp}</td><td>{p.unitsSold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>What people search for</h2>
              {f.searches.length === 0 ? <p className="portal-muted">No searches yet.</p> : (
                <div className="portal-table-wrap">
                  <table className="portal-data-table">
                    <thead><tr><th>Words</th><th>Searches</th></tr></thead>
                    <tbody>{f.searches.map((s) => <tr key={s.term}><td>{s.term}</td><td>{s.searches}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              <h3>Devices</h3>
              <div className="portal-table-wrap">
                <table className="portal-data-table">
                  <thead><tr><th>Device</th><th>Visits</th><th>Orders or WhatsApp</th></tr></thead>
                  <tbody>{f.byDevice.map((d) => <tr key={d.device}><td>{d.device}</td><td>{d.sessions}</td><td>{pct(d.orders + d.tappedWhatsapp, d.sessions)}</td></tr>)}</tbody>
                </table>
              </div>
            </article>
          </div>
        </>
      ) : null}
    </>
  );
}

/** Where staff record what was spent on ads: one line per day and platform. Quick to fill, easy to undo. */
function AdSpendForm({ token, profile, from, to, onChanged }: { token: string; profile: AuthProfile; from: string; to: string; onChanged: () => void }) {
  const [entries, setEntries] = useState<SpendEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ day: iso(new Date()), source: 'Facebook', amountKes: '', campaign: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canAdd = hasPermission(profile, 'marketing-campaign.create');
  const canRemove = hasPermission(profile, 'marketing-campaign.delete');

  const load = useCallback(() => {
    apiRequest<SpendEntry[]>(`/insights/ad-spend?from=${from}&to=${to}`, { method: 'GET' }, token).then(setEntries).catch(() => {});
  }, [from, to, token]);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiRequest('/insights/ad-spend', { method: 'POST', body: JSON.stringify({ day: form.day, source: form.source, amountKes: Number(form.amountKes), campaign: form.campaign || undefined }) }, token);
      setForm((f) => ({ ...f, amountKes: '', campaign: '' }));
      load();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiRequest(`/insights/ad-spend/${id}`, { method: 'DELETE' }, token).catch(() => {});
    load();
    onChanged();
  }

  return (
    <div style={{ borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 12 }}>
      <button type="button" className="portal-inline-btn" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide ad spend' : `Enter ad spend${entries.length ? ` (${entries.length} in this period)` : ''}`}
      </button>
      {open ? (
        <div style={{ marginTop: 12 }}>
          {canAdd ? (
            <form onSubmit={add} className="portal-inline-form" style={{ flexWrap: 'wrap' }}>
              <label><span className="portal-muted" style={{ display: 'block', marginBottom: 4 }}>Day</span><input type="date" value={form.day} max={iso(new Date())} onChange={(e) => setForm({ ...form, day: e.target.value })} required /></label>
              <label><span className="portal-muted" style={{ display: 'block', marginBottom: 4 }}>Platform</span>
                <input list="ad-platforms" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} required />
                <datalist id="ad-platforms">{['Facebook', 'Instagram', 'TikTok', 'Google', 'X', 'YouTube'].map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label><span className="portal-muted" style={{ display: 'block', marginBottom: 4 }}>Spent (KES)</span><input type="number" min={1} step="0.01" value={form.amountKes} onChange={(e) => setForm({ ...form, amountKes: e.target.value })} required placeholder="e.g. 1500" /></label>
              <label><span className="portal-muted" style={{ display: 'block', marginBottom: 4 }}>Campaign (optional)</span><input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} maxLength={80} /></label>
              <button type="submit" className="portal-primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
            </form>
          ) : <p className="portal-muted">Your role can see ad spend but not add it.</p>}
          {error ? <p className="portal-error" style={{ marginTop: 8 }}>{error}</p> : null}
          {entries.length ? (
            <div className="portal-table-wrap" style={{ marginTop: 12 }}>
              <table className="portal-data-table">
                <thead><tr><th>Day</th><th>Platform</th><th>Campaign</th><th>Spent</th><th></th></tr></thead>
                <tbody>
                  {entries.map((en) => (
                    <tr key={en.id}>
                      <td>{en.day}</td><td>{en.source}</td><td>{en.campaign ?? ''}</td><td>{kes(en.amountKes)}</td>
                      <td>{canRemove ? <button type="button" className="portal-inline-btn" onClick={() => void remove(en.id)}>Remove</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type WhatsappReport = {
  contacts: { total: number; newInPeriod: number; fromAds: number; subscribed: number; stopped: number; trade: number; notTold: number; stopRate: number; daily: Array<{ date: string; chats: number; fromAds: number }> };
  onboarding: { waitingForApp: number; waitingForGroup: number; waitingForRating: number; finished: number; gaveUp: number };
  messages: {
    templates: Array<{ kind: string; sent: number; failedToSend: number; delivered: number; read: number; notDelivered: number; awaiting: number }>;
    dailyReports: { sent: number; delivered: number; read: number; notDelivered: number; awaiting: number; failedToSend: number };
    arrivedRate: number | null; checked: number; topFailures: Array<{ reason: string; count: number }>;
  };
  ads: Array<{ adSourceId: string | null; headline: string | null; chats: number; stopped: number; orders: number; revenueKes: number }>;
  chatsToOrders: { chats: number; buyers: number; orders: number; revenueKes: number };
};
const KIND_NAME: Record<string, string> = { APP: 'Download the app', GROUP: 'Join the group', REVIEW: 'Rate us on Google', GOOGLE_REVIEW: 'Google review (full)', SHOE_RANGE: 'Our range of shoes', LOCATION: 'Where to find us' };

/** WhatsApp: who messaged the shop and from which ad, who opted out, what was sent and whether it arrived, and which chats became orders. */
function WhatsappTab({ token, from, to }: { token: string; from: string; to: string }) {
  const w = useReport<WhatsappReport>(`/insights/whatsapp?from=${from}&to=${to}`, token);
  if (w === undefined) return <article className="portal-card"><p className="portal-muted">Loading...</p></article>;
  if (w === null) return <article className="portal-card portal-error">Could not load the WhatsApp report.</article>;

  const c = w.contacts;
  const notes: string[] = [];
  if (c.notTold > 0) notes.push(`${c.notTold} subscribed ${c.notTold === 1 ? 'person has' : 'people have'} not been told yet that updates are coming, so no messages go to them until the notice is sent. It is sent the next time they write to you.`);
  if (c.subscribed + c.stopped >= 20 && c.stopRate > 0.1) notes.push(`${rate(c.stopRate)} of people have replied STOP. Above about 10% the messages are putting people off, and blocks and reports lower the number's quality rating. Look at what is being sent and when.`);
  if (w.messages.arrivedRate !== null && w.messages.checked >= 10 && w.messages.arrivedRate < 0.8) notes.push(`Only ${rate(w.messages.arrivedRate)} of messages that have a delivery report arrived. See the reasons below.`);
  if (w.onboarding.gaveUp > 0) notes.push(`${w.onboarding.gaveUp} ${w.onboarding.gaveUp === 1 ? 'number was' : 'numbers were'} given up on after repeated failures (usually a number not on WhatsApp).`);

  return (
    <>
      <article className="portal-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Chats and subscribers</h2>
        <p className="portal-muted" style={{ marginTop: 0 }}>People who messaged the shop&apos;s WhatsApp number in this period, and where everyone stands overall.</p>
        <div className="portal-stat-grid">
          <div className="portal-stat"><span>New chats</span><h3>{c.newInPeriod}</h3><span className="portal-stat-note">{c.fromAds} from an ad</span></div>
          <div className="portal-stat"><span>Subscribed</span><h3>{c.subscribed}</h3><span className="portal-stat-note">of {c.total} who ever wrote</span></div>
          <div className="portal-stat"><span>Replied STOP</span><h3>{c.stopped}</h3><span className="portal-stat-note">{rate(c.stopRate)} of those who could stay</span></div>
          <div className="portal-stat"><span>Became buyers</span><h3>{w.chatsToOrders.buyers}</h3><span className="portal-stat-note">{w.chatsToOrders.orders} order{w.chatsToOrders.orders === 1 ? '' : 's'}, {kes(w.chatsToOrders.revenueKes)}</span></div>
        </div>
        {notes.length ? <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
        <p className="portal-muted" style={{ fontSize: 13, marginBottom: 0 }}>
          A chat counts as a buyer when the same phone number placed an order after its first message (in any spelling). Orders agreed under another number are not counted. {c.trade ? `${c.trade} trade contact${c.trade === 1 ? '' : 's'} (resellers, wholesalers, suppliers) are never messaged and not counted as chats to market to.` : ''}
        </p>
      </article>

      <article className="portal-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Which ads brought chats</h2>
        {w.ads.length === 0 ? <p className="portal-muted">No chats in this period.</p> : (
          <div className="portal-table-wrap">
            <table className="portal-data-table">
              <thead><tr><th>Ad</th><th>Chats</th><th>Replied STOP</th><th>Became orders</th><th>Sales</th></tr></thead>
              <tbody>
                {w.ads.map((a) => (
                  <tr key={a.adSourceId ?? 'none'}>
                    <td>{a.adSourceId ? <>{a.headline || 'Ad'} <span className="portal-muted">#{a.adSourceId}</span></> : <span className="portal-muted">Not from an ad</span>}</td>
                    <td>{a.chats}</td><td>{a.stopped}</td><td>{a.orders}</td><td>{kes(a.revenueKes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="portal-muted" style={{ fontSize: 13, marginBottom: 0 }}>Ads that open WhatsApp (click-to-WhatsApp) send their details with the first message. Tell the ad platform to send people to WhatsApp, and they appear here.</p>
      </article>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Where subscribers are in the messages</h2>
          <div className="portal-table-wrap">
            <table className="portal-data-table">
              <tbody>
                <tr><td>Waiting for the app message</td><td>{w.onboarding.waitingForApp}</td></tr>
                <tr><td>Waiting for the group message</td><td>{w.onboarding.waitingForGroup}</td></tr>
                <tr><td>Waiting for the rating request</td><td>{w.onboarding.waitingForRating}</td></tr>
                <tr><td>Finished all three</td><td>{w.onboarding.finished}</td></tr>
                <tr><td>Given up on (kept failing)</td><td>{w.onboarding.gaveUp}</td></tr>
              </tbody>
            </table>
          </div>
        </article>
        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Why messages failed</h2>
          {w.messages.topFailures.length === 0 ? <p className="portal-muted">No failures reported by WhatsApp in this period.</p> : (
            <div className="portal-table-wrap">
              <table className="portal-data-table">
                <thead><tr><th>Reason WhatsApp gave</th><th>Messages</th></tr></thead>
                <tbody>{w.messages.topFailures.map((f) => <tr key={f.reason}><td>{f.reason}</td><td>{f.count}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      <article className="portal-card">
        <h2 style={{ marginTop: 0 }}>What was sent, and did it arrive</h2>
        <p className="portal-muted" style={{ marginTop: 0 }}>
          {w.messages.arrivedRate === null ? 'No delivery reports yet.' : `${rate(w.messages.arrivedRate)} of the ${w.messages.checked} messages with a delivery report arrived.`} &ldquo;Waiting&rdquo; means WhatsApp accepted it and has not said yet.
        </p>
        <div className="portal-table-wrap">
          <table className="portal-data-table">
            <thead><tr><th>Message</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Not delivered</th><th>Waiting</th><th>Could not send</th></tr></thead>
            <tbody>
              {w.messages.templates.map((t) => (
                <tr key={t.kind}><td>{KIND_NAME[t.kind] ?? t.kind}</td><td>{t.sent}</td><td>{t.delivered}</td><td>{t.read}</td><td>{t.notDelivered}</td><td>{t.awaiting}</td><td>{t.failedToSend}</td></tr>
              ))}
              <tr><td>Daily report</td><td>{w.messages.dailyReports.sent}</td><td>{w.messages.dailyReports.delivered}</td><td>{w.messages.dailyReports.read}</td><td>{w.messages.dailyReports.notDelivered}</td><td>{w.messages.dailyReports.awaiting}</td><td>{w.messages.dailyReports.failedToSend}</td></tr>
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}

function StockTab({ token, from, to }: { token: string; from: string; to: string }) {
  const [deadDays, setDeadDays] = useState(60);
  const s = useReport<Stock>(`/insights/stock?from=${from}&to=${to}&deadDays=${deadDays}`, token);
  if (s === undefined) return <article className="portal-card"><p className="portal-muted">Loading...</p></article>;
  if (s === null) return <article className="portal-card portal-error">Could not load the stock report.</article>;

  return (
    <>
      <article className="portal-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Stock on the shelf</h2>
        <p className="portal-muted" style={{ marginTop: 0 }}>Shoes and watches. Kits are printed to order and are not counted.</p>
        <div className="portal-stat-grid">
          <div className="portal-stat"><span>Pairs and watches</span><h3>{s.onHand.units.toLocaleString('en-KE')}</h3></div>
          <div className="portal-stat"><span>At selling price</span><h3>{kes(s.onHand.retailValueKes)}</h3><span className="portal-stat-note">What it would bring in</span></div>
          <div className="portal-stat">
            <span>At cost</span><h3>{s.onHand.costValueKes > 0 ? kes(s.onHand.costValueKes) : '–'}</h3>
            <span className="portal-stat-note">{s.onHand.productsWithoutCost > 0 ? `${s.onHand.productsWithoutCost} in stock without a cost` : 'Every product in stock has a cost'}</span>
          </div>
        </div>
      </article>

      <article className="portal-card" style={{ marginBottom: 20 }}>
        <div className="portal-card-header-row">
          <h2 style={{ margin: 0 }}>Not selling</h2>
          <label className="portal-muted">Not sold for{' '}
            <select value={deadDays} onChange={(e) => setDeadDays(Number(e.target.value))}>{[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
          </label>
        </div>
        {s.deadStock.count === 0 ? <p className="portal-muted">Nothing in stock has gone {s.deadDays} days without a sale.</p> : (
          <>
            <p><strong>{kes(s.deadStock.tiedUpKes)}</strong> is tied up in {s.deadStock.count} product{s.deadStock.count === 1 ? ' that has' : 's that have'} not sold in {s.deadDays} days. A discount, a bundle or an ad on these turns shelf space back into cash.</p>
            <div className="portal-table-wrap">
              <table className="portal-data-table">
                <thead><tr><th>Product</th><th>Units</th><th>Tied up</th><th>Last sold</th></tr></thead>
                <tbody>
                  {s.deadStock.items.map((d) => (
                    <tr key={d.slug}>
                      <td>{d.name}</td><td>{d.units}</td>
                      <td>{kes(d.valueKes)} <span className="portal-muted">at {d.basis === 'mixed' ? 'cost where known' : d.basis}</span></td>
                      <td>{d.daysSinceSale === null ? `Never (listed ${d.onShelfDays} days)` : `${d.daysSinceSale} days ago`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Running low on fast sellers</h2>
          {s.runningLow.length === 0 ? <p className="portal-muted">No steady seller is close to running out.</p> : (
            <div className="portal-table-wrap">
              <table className="portal-data-table">
                <thead><tr><th>Product</th><th>Left</th><th>Sold</th><th>Lasts about</th></tr></thead>
                <tbody>{s.runningLow.map((r) => <tr key={r.slug}><td>{r.name}</td><td>{r.units}</td><td>{r.soldInPeriod}</td><td>{r.coverDays} days</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </article>
        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Out of stock, still wanted</h2>
          {s.missedDemand.length === 0 ? <p className="portal-muted">No out-of-stock product is getting looks or messages.</p> : (
            <>
              <div className="portal-table-wrap">
                <table className="portal-data-table">
                  <thead><tr><th>Product</th><th>Views</th><th>Carts</th><th>WhatsApp</th></tr></thead>
                  <tbody>{s.missedDemand.map((r) => <tr key={r.slug}><td>{r.name}</td><td>{r.views}</td><td>{r.carts}</td><td>{r.whatsapp}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="portal-muted" style={{ marginBottom: 0 }}>People are asking for these. They can still be ordered from a supplier, but restocking the top of this list is the cheapest sale you can win.</p>
            </>
          )}
        </article>
      </div>
    </>
  );
}

function CustomersTab({ token, from, to }: { token: string; from: string; to: string }) {
  const [lapseDays, setLapseDays] = useState(60);
  const b = useReport<Buyers>(`/insights/buyers?from=${from}&to=${to}&lapseDays=${lapseDays}`, token);
  if (b === undefined) return <article className="portal-card"><p className="portal-muted">Loading...</p></article>;
  if (b === null) return <article className="portal-card portal-error">Could not load the customer report.</article>;

  return (
    <>
      <article className="portal-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Who buys, and who comes back</h2>
        <p className="portal-muted" style={{ marginTop: 0 }}>Retail buyers, matched by phone number. Resellers and wholesale accounts are left out: they buy differently.</p>
        {b.buyers === 0 ? <p className="portal-muted">No retail orders in this period.</p> : (
          <div className="portal-stat-grid">
            <div className="portal-stat"><span>Buyers</span><h3>{b.buyers}</h3><span className="portal-stat-note">{b.newBuyers} new, {b.returningBuyers} came back</span></div>
            <div className="portal-stat"><span>Came back</span><h3>{rate(b.repeatRate)}</h3><span className="portal-stat-note">Had bought before this period</span></div>
            <div className="portal-stat"><span>Money from repeat buyers</span><h3>{rate(b.repeatRevenueShare)}</h3></div>
            <div className="portal-stat"><span>Average order</span><h3>{kes(b.averageOrderKes)}</h3></div>
            <div className="portal-stat"><span>Each buyer is worth</span><h3>{kes(b.averageLifetimeKes)}</h3><span className="portal-stat-note">{b.averageOrdersPerBuyer.toFixed(1)} orders on average, all time</span></div>
          </div>
        )}
        {b.unrecognisedOrders > 0 ? (
          <p className="portal-muted" style={{ marginBottom: 0 }}>{b.unrecognisedOrders} order{b.unrecognisedOrders === 1 ? ' has' : 's have'} no phone number or email, so {b.unrecognisedOrders === 1 ? 'it' : 'they'} cannot be matched to a returning buyer. Always take a phone number at the counter.</p>
        ) : null}
      </article>

      <article className="portal-card">
        <div className="portal-card-header-row">
          <h2 style={{ margin: 0 }}>Gone quiet</h2>
          <label className="portal-muted">No order for{' '}
            <select value={lapseDays} onChange={(e) => setLapseDays(Number(e.target.value))}>{[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
          </label>
        </div>
        {b.lapsed.length === 0 ? <p className="portal-muted">Nobody who has bought has been away that long.</p> : (
          <>
            <p>{b.lapsedCount} buyer{b.lapsedCount === 1 ? ' has' : 's have'} not ordered in {b.lapseDays} days. Those who bought more than once are first. The link opens WhatsApp with a message ready; you press send.</p>
            <div className="portal-table-wrap">
              <table className="portal-data-table">
                <thead><tr><th>Buyer</th><th>Orders</th><th>Spent</th><th>Last order</th><th></th></tr></thead>
                <tbody>
                  {b.lapsed.map((l) => (
                    <tr key={`${l.phone}-${l.lastOrder}-${l.name}`}>
                      <td>{l.name}</td><td>{l.orders}</td><td>{kes(l.spendKes)}</td><td>{l.daysAgo} days ago</td>
                      <td>{l.phone ? <a className="portal-inline-btn" href={winBackLink(l.phone, l.name)} target="_blank" rel="noreferrer">Message on WhatsApp</a> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </>
  );
}
