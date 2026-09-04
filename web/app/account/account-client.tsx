"use client";

/**
 * The customer's own area: their orders, their details, their password.
 *
 * Orders come from /customer-portal/orders, which reads the customer id from
 * the verified token rather than the URL, so one customer cannot fetch
 * another's history by editing an id.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EliteLayout } from '../components/elite-layout';
import { PasswordInput } from '../components/password-input';
import { customerApi, useCustomerAuth } from '../lib/customer-auth';
import { formatKes } from '../lib/shop';
import { absoluteUrl } from '../lib/site';
import { withReferral } from '../lib/referral';
import { ShareButton } from '../components/share-button';

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: string;
  total: number;
  amountPaid: number;
  shippingAddress?: string | null;
  store?: { name: string; location?: string | null } | null;
  lines: Array<{ description: string; quantity: number; lineTotal: number; imageUrl?: string | null }>;
};

type ReferralSummary = {
  totalClicks: number;
  referredOrders: number;
  conversionRate: number | null;
  accruedBalance: number;
  paidOutTotal: number;
};

function formatDay(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Unlike shop.ts's formatKes (built for a product price, where 0 or less
// means "no real price yet" and should read as "Price on request"), a
// commission figure of exactly 0 is a real, meaningful answer -- "nothing
// earned yet" -- and must display as such.
function formatKesAmount(value: number) {
  return `KSh ${Math.round(value).toLocaleString('en-KE')}`;
}

export function AccountClient() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwState, setPwState] = useState<{ error?: string; done?: boolean; busy?: boolean }>({});
  const [applyForm, setApplyForm] = useState({ businessName: '', reason: '' });
  const [applyState, setApplyState] = useState<{ error?: string; done?: boolean; busy?: boolean }>({});
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '', businessName: '' });
  const [profileState, setProfileState] = useState<{ error?: string; done?: boolean; busy?: boolean }>({});
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  // Every edit form starts collapsed: a signed-in customer visiting their
  // account almost always wants to look something up, not change it, so the
  // page opens as a read-only summary and only shows an input when the
  // matching "Edit"/"Change password" toggle is clicked.
  const [editingProfile, setEditingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [applyingTrade, setApplyingTrade] = useState(false);

  useEffect(() => {
    if (auth.ready && !auth.customer) router.replace('/account/login');
  }, [auth.ready, auth.customer, router]);

  const loadOrders = useCallback(async () => {
    if (!auth.token) return;
    try {
      setOrders(await customerApi<Order[]>('/customer-portal/orders', { method: 'GET' }, auth.token));
    } catch {
      setOrders([]);
    }
  }, [auth.token]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Only a trade customer has a referral link to have earned anything
  // against, so this stays unfetched (and the panel below unrendered) for a
  // retail customer -- avoiding a pointless 401-adjacent round trip.
  const loadReferralSummary = useCallback(async () => {
    if (!auth.token || !auth.customer || auth.customer.priceTier === 'RETAIL') return;
    try {
      const result = await customerApi<{ summary: ReferralSummary }>(
        '/customer-portal/referrals', { method: 'GET' }, auth.token,
      );
      setReferralSummary(result.summary);
    } catch {
      setReferralSummary(null);
    }
  }, [auth.token, auth.customer]);

  useEffect(() => { void loadReferralSummary(); }, [loadReferralSummary]);

  // Reseeded whenever the profile changes underneath it (initial load, or a
  // successful save elsewhere) so the form never shows stale values -- but
  // only from auth.customer, never the other way, so mid-edit keystrokes
  // aren't clobbered by an unrelated auth.refresh() (e.g. from the reseller
  // application panel).
  useEffect(() => {
    if (!auth.customer) return;
    setProfileForm({
      firstName: auth.customer.firstName || '',
      lastName: auth.customer.lastName || '',
      phone: auth.customer.phone || '',
      businessName: auth.customer.businessName || '',
    });
  }, [auth.customer]);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPwState({ busy: true });
    try {
      await customerApi('/customer-portal/change-password', {
        method: 'POST',
        body: JSON.stringify(pw),
      }, auth.token);
      setPw({ currentPassword: '', newPassword: '' });
      setPwState({ done: true });
      setChangingPassword(false);
    } catch (caught) {
      setPwState({ error: caught instanceof Error ? caught.message : 'Could not change your password.' });
    }
  }

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileState({ busy: true });
    try {
      await customerApi('/customer-portal/me', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      }, auth.token);
      setProfileState({ done: true });
      setEditingProfile(false);
      void auth.refresh();
    } catch (caught) {
      setProfileState({ error: caught instanceof Error ? caught.message : 'Could not save your details.' });
    }
  }

  async function onSubmitApplication(event: FormEvent) {
    event.preventDefault();
    setApplyState({ busy: true });
    try {
      await customerApi('/customer-portal/reseller-application', {
        method: 'POST',
        body: JSON.stringify(applyForm),
      }, auth.token);
      setApplyForm({ businessName: '', reason: '' });
      setApplyState({ done: true });
      // Refreshes auth.customer so hasPendingResellerApplication flips to
      // true immediately, swapping the form for the pending message without
      // a page reload.
      void auth.refresh();
    } catch (caught) {
      setApplyState({ error: caught instanceof Error ? caught.message : 'Could not submit your application.' });
    }
  }

  if (!auth.ready || !auth.customer) {
    return (
      <EliteLayout active="none">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-auth"><div className="de-auth-card"><h1>Loading…</h1></div></section>
        </main>
      </EliteLayout>
    );
  }

  const customer = auth.customer;
  const isTrade = customer.priceTier && customer.priceTier !== 'RETAIL';

  return (
    <EliteLayout active="none">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <h1>Hello, {customer.firstName}</h1>
          <p>{customer.email}</p>
        </section>

        <section className="lp-container de-account">
          <div className="de-account-main">
            <h2>Your orders</h2>
            {orders === null ? (
              <p className="de-auth-intro">Loading your orders…</p>
            ) : orders.length === 0 ? (
              <div className="de-empty">
                <p>No orders yet.</p>
                <Link href="/shop" className="lp-button lp-button-primary">Shop Shoes</Link>
              </div>
            ) : (
              orders.map((order) => {
                const owing = order.total - order.amountPaid;
                // The list rule everywhere else in the app: an order with
                // several products shows the first one's photo, not a
                // collage -- this card already lists every line by name
                // right below, so the thumbnail is just a visual anchor.
                const imageUrl = order.lines[0]?.imageUrl;
                return (
                  <article key={order.id} className="de-account-order">
                    <header>
                      <div className="de-account-order-heading">
                        {imageUrl ? (
                          <img src={imageUrl} alt="" className="de-account-order-thumb" loading="lazy" />
                        ) : (
                          <div className="de-account-order-thumb is-empty" aria-hidden="true" />
                        )}
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <span className="de-account-date">{formatDay(order.placedAt)}</span>
                        </div>
                      </div>
                      <span className="de-account-status">{order.status}</span>
                    </header>
                    <ul>
                      {order.lines.map((line, index) => (
                        <li key={index}>
                          <span>{line.quantity} × {line.description}</span>
                          <em>{formatKes(line.lineTotal)}</em>
                        </li>
                      ))}
                    </ul>
                    <footer>
                      <span>
                        {order.shippingAddress
                          ? `Delivering to ${order.shippingAddress}`
                          : `Collect at ${order.store?.name || 'the shop'}`}
                      </span>
                      <strong>
                        {formatKes(order.total)}
                        {owing > 0.001 ? ` · ${formatKes(owing)} owing` : ''}
                      </strong>
                    </footer>
                  </article>
                );
              })
            )}
          </div>

          <aside className="de-account-side">
            <div className="de-checkout-panel">
              <div className="de-panel-head">
                <h2>Your details</h2>
                {!editingProfile ? (
                  <button type="button" className="de-panel-toggle" onClick={() => setEditingProfile(true)}>
                    Edit
                  </button>
                ) : null}
              </div>

              {profileState.done && !editingProfile ? (
                <p className="de-auth-notice" role="status" style={{ marginBottom: 12 }}>Details saved.</p>
              ) : null}

              {!editingProfile ? (
                <dl className="de-detail-rows">
                  <div><dt>Name</dt><dd>{`${customer.firstName} ${customer.lastName}`.trim() || '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{customer.phone || '—'}</dd></div>
                  <div><dt>Email</dt><dd>{customer.email}</dd></div>
                  {isTrade ? (
                    <>
                      <div><dt>Business name</dt><dd>{customer.businessName || '—'}</dd></div>
                      <div><dt>Price list</dt><dd><span className="de-badge">{customer.priceTier}</span></dd></div>
                    </>
                  ) : null}
                </dl>
              ) : (
                <>
                  {profileState.error ? <p className="de-checkout-error" role="alert">{profileState.error}</p> : null}
                  <form className="de-checkout-form" onSubmit={onSaveProfile}>
                    <label>
                      <span>First name</span>
                      <input required value={profileForm.firstName}
                        onChange={(event) => setProfileForm((p) => ({ ...p, firstName: event.target.value }))} />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input required value={profileForm.lastName}
                        onChange={(event) => setProfileForm((p) => ({ ...p, lastName: event.target.value }))} />
                    </label>
                    <label>
                      <span>Phone</span>
                      <input required value={profileForm.phone}
                        onChange={(event) => setProfileForm((p) => ({ ...p, phone: event.target.value }))} />
                    </label>
                    {/* Trade customers see the price list they buy on, so a
                        wholesale shop knows the prices they are quoted are theirs. */}
                    {isTrade ? (
                      <>
                        <label>
                          <span>Business name (optional)</span>
                          <input value={profileForm.businessName}
                            onChange={(event) => setProfileForm((p) => ({ ...p, businessName: event.target.value }))} />
                        </label>
                        <p className="de-checkout-note">Price list: {customer.priceTier}</p>
                      </>
                    ) : null}
                    <p className="de-checkout-note">
                      Email is your sign-in and can't be changed here — message us on WhatsApp if it needs to change.
                    </p>
                    <div className="de-referral-hero-actions">
                      <button type="submit" className="lp-button lp-button-primary" disabled={profileState.busy}>
                        {profileState.busy ? 'Saving…' : 'Save details'}
                      </button>
                      <button type="button" className="lp-button lp-button-ghost"
                        onClick={() => { setEditingProfile(false); setProfileState({}); }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            {isTrade && customer.referralCode ? (
              <div className="de-checkout-panel">
                <h2>Your referral link</h2>
                <div className="de-referral-hero">
                  <span className="de-referral-hero-link">{withReferral(absoluteUrl('/shop'), customer)}</span>
                  <div className="de-referral-hero-actions">
                    <ShareButton
                      url={withReferral(absoluteUrl('/shop'), customer)}
                      title="Shop Drip Emporium"
                      text="Check out Drip Emporium"
                    />
                    <span className="de-checkout-note" style={{ margin: 0 }}>
                      Anyone who buys through this link is credited to you.
                    </span>
                  </div>
                </div>

                {referralSummary ? (
                  <div className="de-stat-grid" style={{ marginTop: 16 }}>
                    <div className="de-stat-card">
                      <span>Link clicks</span>
                      <strong>{referralSummary.totalClicks}</strong>
                    </div>
                    <div className="de-stat-card">
                      <span>Referred orders</span>
                      <strong>{referralSummary.referredOrders}</strong>
                    </div>
                    <div className="de-stat-card">
                      <span>Accrued</span>
                      <strong>{formatKesAmount(referralSummary.accruedBalance)}</strong>
                    </div>
                    <div className="de-stat-card is-highlight">
                      <span>Paid out</span>
                      <strong>{formatKesAmount(referralSummary.paidOutTotal)}</strong>
                    </div>
                  </div>
                ) : null}

                <Link href="/account/reseller" className="lp-button lp-button-primary" style={{ width: '100%', marginTop: 16 }}>
                  View full referral dashboard
                </Link>
              </div>
            ) : null}

            {!isTrade ? (
              <div className="de-checkout-panel">
                <div className="de-panel-head">
                  <h2>Trade pricing</h2>
                  {!applyingTrade && !customer.hasPendingResellerApplication && !applyState.done ? (
                    <button type="button" className="de-panel-toggle" onClick={() => setApplyingTrade(true)}>
                      Apply
                    </button>
                  ) : null}
                </div>

                {customer.hasPendingResellerApplication ? (
                  <p className="de-checkout-note">
                    Your application is with us for review. We will be in touch.
                  </p>
                ) : applyState.done ? (
                  <p className="de-auth-notice" role="status">Application sent — we will be in touch.</p>
                ) : !applyingTrade ? (
                  <p className="de-checkout-note">
                    Buy at reseller or wholesale prices. Apply and we will review your business.
                  </p>
                ) : (
                  <>
                    {applyState.error ? <p className="de-checkout-error" role="alert">{applyState.error}</p> : null}
                    <form className="de-checkout-form" onSubmit={onSubmitApplication}>
                      <label>
                        <span>Business name</span>
                        <input required value={applyForm.businessName}
                          onChange={(event) => setApplyForm((p) => ({ ...p, businessName: event.target.value }))} />
                      </label>
                      <label>
                        <span>Tell us about your business</span>
                        <textarea required rows={3} value={applyForm.reason}
                          onChange={(event) => setApplyForm((p) => ({ ...p, reason: event.target.value }))} />
                      </label>
                      <div className="de-referral-hero-actions">
                        <button type="submit" className="lp-button lp-button-primary" disabled={applyState.busy}>
                          {applyState.busy ? 'Sending…' : 'Apply for trade pricing'}
                        </button>
                        <button type="button" className="lp-button lp-button-ghost" onClick={() => setApplyingTrade(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            ) : null}

            <div className="de-checkout-panel">
              <div className="de-panel-head">
                <h2>Password</h2>
                {!changingPassword ? (
                  <button type="button" className="de-panel-toggle" onClick={() => setChangingPassword(true)}>
                    Change
                  </button>
                ) : null}
              </div>

              {pwState.done && !changingPassword ? (
                <p className="de-auth-notice" role="status">Password changed.</p>
              ) : !changingPassword ? (
                <p className="de-checkout-note">••••••••</p>
              ) : (
                <>
                  {pwState.error ? <p className="de-checkout-error" role="alert">{pwState.error}</p> : null}
                  <form className="de-checkout-form" onSubmit={onChangePassword}>
                    <label>
                      <span>Current password</span>
                      <PasswordInput required autoComplete="current-password"
                        value={pw.currentPassword}
                        onChange={(event) => setPw((p) => ({ ...p, currentPassword: event.target.value }))} />
                    </label>
                    <label>
                      <span>New password</span>
                      <PasswordInput required minLength={8} autoComplete="new-password"
                        value={pw.newPassword}
                        onChange={(event) => setPw((p) => ({ ...p, newPassword: event.target.value }))} />
                    </label>
                    <div className="de-referral-hero-actions">
                      <button type="submit" className="lp-button lp-button-primary" disabled={pwState.busy}>
                        {pwState.busy ? 'Saving…' : 'Change password'}
                      </button>
                      <button type="button" className="lp-button lp-button-ghost"
                        onClick={() => { setChangingPassword(false); setPwState({}); setPw({ currentPassword: '', newPassword: '' }); }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            <button
              type="button"
              className="lp-button lp-button-ghost de-account-signout"
              onClick={() => { auth.logout(); router.replace('/'); }}
            >
              Sign out
            </button>
          </aside>
        </section>
      </main>
    </EliteLayout>
  );
}
