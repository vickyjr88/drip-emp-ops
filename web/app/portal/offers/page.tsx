"use client";

/**
 * Special offers, for clearing stock that is not moving.
 *
 * The screen leads with the dead-stock list rather than an empty "create
 * offer" form, because the hard part is not writing the discount -- it is
 * knowing what to discount. Stock is ranked by money tied up at cost, so the
 * worst of it argues for itself, and anything already discounted is marked so
 * it is not marked down twice.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListSearch, useListControls } from '../components/list-controls';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type DeadRow = {
  variantId: string; sku: string; size: string; productName: string; brand: string | null;
  storeName: string; quantity: number; priceKes: number; costKes: number | null;
  tiedUp: number | null; lastSoldAt: string | null; neverSold: boolean;
  daysIdle: number; onOffer: boolean;
};

type OfferLine = {
  id: string; variantId: string; offerPriceKes: number; wasPriceKes: number; saving: number;
  variant?: { sku: string; name: string; product: { name: string } };
};

type Offer = {
  id: string; name: string; label: string | null; status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  percentOff: number | null; fixedPriceKes: number | null;
  startsAt: string | null; endsAt: string | null;
  itemCount: number; isLive: boolean; hasExpired: boolean; lines: OfferLine[];
};

const BLANK = { name: '', label: 'Clearance', mode: 'percent' as 'percent' | 'fixed', amount: '', endsAt: '' };

export default function OffersPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [dead, setDead] = useState<{ rows: DeadRow[]; totals: any } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [days, setDays] = useState(60);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(BLANK);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string, forDays: number) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      if (hasPermission(nextProfile, 'offer.read')) {
        const [nextDead, nextOffers] = await Promise.all([
          apiRequest<any>(`/offers/dead-stock?days=${forDays}`, { method: 'GET' }, authToken),
          apiRequest<Offer[]>('/offers?includeEnded=true', { method: 'GET' }, authToken),
        ]);
        setDead(nextDead);
        setOffers(nextOffers);
      }
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
    // setErrorMessage is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token, days);
  }, [initialized, token, days, load]);

  const rows = dead?.rows || [];
  const controls = useListControls(rows, (row) => [row.sku, row.productName, row.brand || '', row.size]);

  // What the chosen markdown would come to, so nobody publishes a price they
  // have not seen. Recomputed as the form changes.
  const preview = useMemo(() => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const chosen = rows.filter((row) => picked.has(row.variantId));
    if (!chosen.length) return null;

    const priced = chosen.map((row) => {
      const price = form.mode === 'percent' ? row.priceKes * (1 - amount / 100) : amount;
      return { row, price: Math.round(price * 100) / 100 };
    });
    return {
      count: priced.length,
      belowCost: priced.filter((p) => p.row.costKes !== null && p.price < p.row.costKes),
      notCheaper: priced.filter((p) => p.price >= p.row.priceKes),
      revenue: priced.reduce((sum, p) => sum + p.price * p.row.quantity, 0),
      given: priced.reduce((sum, p) => sum + (p.row.priceKes - p.price) * p.row.quantity, 0),
    };
  }, [form, picked, rows]);

  function toggle(variantId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  async function onCreate() {
    if (!token || saving) return;
    if (!form.name.trim() || !picked.size || !Number(form.amount)) {
      setErrorMessage('A name, a discount and at least one item are all needed.');
      return;
    }
    if (preview?.notCheaper.length) {
      setErrorMessage(`${preview.notCheaper.length} item(s) would not be cheaper than they are now.`);
      return;
    }
    if (preview?.belowCost.length) {
      const ok = await dialog.confirm({
        title: 'Sell below cost?',
        message: `${preview.belowCost.length} item(s) would sell for less than they cost: ${preview.belowCost
          .map((p) => p.row.sku).join(', ')}. Clearing stock can still be worth it — carry on?`,
        confirmLabel: 'Yes, create the offer',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      await apiRequest('/offers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          label: form.label.trim() || undefined,
          ...(form.mode === 'percent'
            ? { percentOff: Number(form.amount) }
            : { fixedPriceKes: Number(form.amount) }),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
          lines: Array.from(picked).map((variantId) => ({ variantId })),
        }),
      }, token);
      setFeedback(`"${form.name}" created as a draft. Publish it when you are ready.`);
      setForm(BLANK);
      setPicked(new Set());
      await load(token, days);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(offer: Offer, status: 'ACTIVE' | 'ENDED') {
    if (!token) return;
    if (status === 'ENDED') {
      const ok = await dialog.confirm({
        title: `End "${offer.name}"?`,
        message: 'Prices go back to normal straight away. The offer is kept for the record.',
        confirmLabel: 'End it',
      });
      if (!ok) return;
    }
    try {
      await apiRequest(`/offers/${offer.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
      setFeedback(status === 'ACTIVE' ? `"${offer.name}" is live.` : `"${offer.name}" ended.`);
      await load(token, days);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading offers...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card">
              <h2>Authentication required</h2>
              <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const canCreate = hasPermission(profile, 'offer.create');
  const canUpdate = hasPermission(profile, 'offer.update');

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="offers"
            pageTitle="Special Offers"
            pageSubtitle="Clear stock that is not moving. Retail prices only — reseller and wholesale tiers are untouched."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {/* ---- Running offers -------------------------------------- */}
            <article className="portal-card" style={{ marginBottom: 20 }}>
              <h2 style={{ marginTop: 0 }}>Offers</h2>
              {offers.length === 0 ? (
                <div className="portal-empty-state">
                  No offers yet. Pick the slow movers below to make one.
                </div>
              ) : (
                <div className="portal-list-stack">
                  {offers.map((offer) => (
                    <div key={offer.id} className="portal-list-row">
                      <div>
                        <strong>{offer.name}</strong>
                        {offer.label ? <span className="portal-muted"> · {offer.label}</span> : null}
                        <p className="portal-muted" style={{ margin: '2px 0 0' }}>
                          {offer.percentOff !== null
                            ? `${offer.percentOff}% off`
                            : `${formatMoney(offer.fixedPriceKes ?? 0)} flat`}
                          {' · '}{offer.itemCount} item{offer.itemCount === 1 ? '' : 's'}
                          {offer.endsAt ? ` · ends ${formatDate(offer.endsAt)}` : ''}
                        </p>
                      </div>
                      <div className="portal-list-meta">
                        {/* Live is not the same as ACTIVE: a scheduled offer is
                            published but not yet running. */}
                        <span>
                          {offer.isLive ? 'Live' : offer.status === 'ACTIVE' ? 'Scheduled' : offer.status}
                        </span>
                        {offer.hasExpired ? <span className="portal-muted">Expired</span> : null}
                      </div>
                      {canUpdate ? (
                        <span className="portal-inline-actions">
                          {offer.status === 'DRAFT' ? (
                            <button type="button" className="portal-inline-btn"
                              onClick={() => void setStatus(offer, 'ACTIVE')}>
                              Publish
                            </button>
                          ) : null}
                          {offer.status !== 'ENDED' ? (
                            <button type="button" className="portal-inline-btn"
                              onClick={() => void setStatus(offer, 'ENDED')}>
                              End
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>

            {/* ---- Dead stock ------------------------------------------- */}
            <article className="portal-card">
              <div className="portal-card-head">
                <h2 style={{ margin: 0 }}>Not selling</h2>
                <label className="portal-inline-actions" style={{ fontSize: 13 }}>
                  <span className="portal-muted">Idle for at least</span>
                  <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>6 months</option>
                  </select>
                </label>
              </div>

              {dead ? (
                <div className="portal-stat-grid" style={{ marginBottom: 16 }}>
                  <div className="portal-stat"><span>Sizes</span><h3>{dead.totals.variants}</h3></div>
                  <div className="portal-stat"><span>Pairs</span><h3>{dead.totals.units}</h3></div>
                  <div className="portal-stat">
                    <span>Money tied up</span>
                    <h3>{formatMoney(dead.totals.tiedUp)}</h3>
                    <span className="portal-stat-note">At cost</span>
                  </div>
                </div>
              ) : null}

              {rows.length === 0 ? (
                <div className="portal-empty-state">
                  Nothing has been sitting that long. Try a shorter period.
                </div>
              ) : (
                <>
                  <div className="list-toolbar">
                    <ListSearch controls={controls} placeholder="Search product, SKU, size…" />
                  </div>

                  <div className="portal-table-wrap">
                    <table className="portal-data-table">
                      <thead>
                        <tr>
                          <th />
                          <th>Product</th>
                          <th>Size</th>
                          <th className="portal-num">Pairs</th>
                          <th className="portal-num">Price</th>
                          <th className="portal-num">Tied up</th>
                          <th>Last sold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {controls.visible.map((row) => (
                          <tr key={row.variantId}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.sku}`}
                                checked={picked.has(row.variantId)}
                                disabled={row.onOffer}
                                onChange={() => toggle(row.variantId)}
                              />
                            </td>
                            <td>
                              {row.productName}
                              <span className="portal-muted"> · {row.sku}</span>
                              {row.onOffer ? (
                                <strong className="portal-overdue-flag">On offer</strong>
                              ) : null}
                            </td>
                            <td>{row.size}</td>
                            <td className="portal-num">{row.quantity}</td>
                            <td className="portal-num">{formatMoney(row.priceKes)}</td>
                            <td className="portal-num">
                              {row.tiedUp === null ? '—' : formatMoney(row.tiedUp)}
                            </td>
                            <td>
                              {/* Never sold is the more useful statement: it is
                                  not that it sold long ago, it never has. */}
                              {row.neverSold
                                ? `Never · ${row.daysIdle}d in stock`
                                : `${formatDate(row.lastSoldAt!)} · ${row.daysIdle}d`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </article>

            {/* ---- Create ------------------------------------------------ */}
            {canCreate && picked.size > 0 ? (
              <article className="portal-card" style={{ marginTop: 20 }}>
                <h2 style={{ marginTop: 0 }}>
                  New offer · {picked.size} item{picked.size === 1 ? '' : 's'} selected
                </h2>
                <div className="portal-entity-grid-2">
                  <label>
                    <span>Name</span>
                    <input value={form.name} placeholder="End of season clearance"
                      onChange={(event) => setForm((p) => ({ ...p, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>Badge on the shop</span>
                    <input value={form.label} placeholder="Clearance"
                      onChange={(event) => setForm((p) => ({ ...p, label: event.target.value }))} />
                  </label>
                </div>
                <div className="portal-entity-grid-3">
                  <label>
                    <span>Discount type</span>
                    <select value={form.mode}
                      onChange={(event) => setForm((p) => ({ ...p, mode: event.target.value as 'percent' | 'fixed' }))}>
                      <option value="percent">Percentage off</option>
                      <option value="fixed">Flat price</option>
                    </select>
                  </label>
                  <label>
                    <span>{form.mode === 'percent' ? 'Percent off' : 'Price (KES)'}</span>
                    <input type="number" min="1" value={form.amount}
                      placeholder={form.mode === 'percent' ? '30' : '1500'}
                      onChange={(event) => setForm((p) => ({ ...p, amount: event.target.value }))} />
                  </label>
                  <label>
                    <span>Ends (optional)</span>
                    <input type="date" value={form.endsAt}
                      onChange={(event) => setForm((p) => ({ ...p, endsAt: event.target.value }))} />
                  </label>
                </div>

                {preview ? (
                  <div className="portal-detail-stats" style={{ marginTop: 12 }}>
                    <div><span>Would bring in</span><strong>{formatMoney(preview.revenue)}</strong></div>
                    <div><span>Given away</span><strong>{formatMoney(preview.given)}</strong></div>
                    {preview.belowCost.length ? (
                      <div>
                        <span>Below cost</span>
                        <strong>{preview.belowCost.length} item(s)</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {preview?.notCheaper.length ? (
                  <p className="portal-muted" style={{ marginTop: 10 }}>
                    {preview.notCheaper.length} item(s) would not actually be cheaper — check the amount.
                  </p>
                ) : null}

                <div className="portal-inline-actions" style={{ marginTop: 14 }}>
                  <button type="button" className="portal-primary-btn" disabled={saving}
                    onClick={() => void onCreate()}>
                    {saving ? 'Creating…' : 'Create as draft'}
                  </button>
                  <button type="button" className="portal-inline-btn" onClick={() => setPicked(new Set())}>
                    Clear selection
                  </button>
                </div>
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
