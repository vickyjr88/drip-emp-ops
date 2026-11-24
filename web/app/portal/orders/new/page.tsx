"use client";

/**
 * New order: keying in a sale that happened somewhere else (a call, a DM, someone at the counter), quickly, against the right customer.
 *
 * One screen, top to bottom, in the order you are told things: who, how it came in, what they want, where it goes, how they paid. The total and the
 * button stay in view on the right. Customers and items are found with one search box each (see customer-picker.tsx and the item box below), so
 * there is no list to scroll and nothing downloaded up front.
 *
 * The customer's price list (Retail, Reseller, Wholesale) prices every line, and can be changed here: tagging a customer as a reseller or wholesaler
 * is one tap, and the lines re-price at once (except any price that was typed by hand).
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { Combobox } from '../../components/combobox';
import { CustomerPicker, PickedCustomer, Tier, TIER_LABEL, TierTag, splitTyped } from '../../components/customer-picker';
import { useErrorState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, asList, canReadRbacFor, formatMoney, hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';

type Store = { id: string; code: string; name: string };
type Option = {
  variantId: string; sku: string; variantName: string; productId: string; productName: string; brand: string | null;
  priceKes: number; resellerPriceKes: number | null; wholesalePriceKes: number | null;
  isDropShip: boolean; sellable: number; imageUrl: string | null; mustOrder: boolean;
};
type Fulfilment = 'STOCK' | 'SUPPLIER_ORDER';
type Line = { option: Option; quantity: number; unitPrice: number; priceEdited: boolean; discount: number; fulfillmentType: Fulfilment };
type LeadLine = { variantId: string; sku: string; name: string; size: string; quantity: number; priceKes: number };
type Lead = {
  id: string; source: 'WHATSAPP_ORDER' | 'ABANDONED_CART'; customerName?: string | null; customerPhone?: string | null; customerEmail?: string | null;
  lines: LeadLine[]; shippingAddress?: string | null;
};

const CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'IN_STORE', label: 'In store' }, { value: 'WHATSAPP', label: 'WhatsApp' }, { value: 'PHONE', label: 'Phone call' },
  { value: 'INSTAGRAM', label: 'Instagram' }, { value: 'TIKTOK', label: 'TikTok' }, { value: 'WEBSITE', label: 'Website' },
];
const METHODS: Array<{ value: string; label: string }> = [
  { value: 'MPESA', label: 'M-Pesa' }, { value: 'CASH', label: 'Cash' }, { value: 'CARD', label: 'Card' }, { value: 'BANK_TRANSFER', label: 'Bank' },
];

/** The same rule as the server's priceForTier: wholesale falls back to reseller, then retail. */
function tierPrice(o: Pick<Option, 'priceKes' | 'resellerPriceKes' | 'wholesalePriceKes'>, tier: Tier): number {
  if (tier === 'WHOLESALE') return o.wholesalePriceKes ?? o.resellerPriceKes ?? o.priceKes;
  if (tier === 'RESELLER') return o.resellerPriceKes ?? o.priceKes;
  return o.priceKes;
}

const num = (text: string) => { const n = Number(text); return Number.isFinite(n) ? n : 0; };

export default function NewOrderPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [errorMessage, setErrorMessage] = useErrorState();

  const [storeId, setStoreId] = useState('');
  const [channel, setChannel] = useState('IN_STORE');
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [walkInInfo, setWalkInInfo] = useState({ name: '', phone: '' });
  /** The price list for this order. Follows the customer's tag, but the person at the till can override it for one order. */
  const [tier, setTier] = useState<Tier>('RETAIL');
  const [lines, setLines] = useState<Line[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [address, setAddress] = useState('');
  const [shipping, setShipping] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [pay, setPay] = useState({ on: true, method: 'MPESA', amount: '', reference: '' });
  const [payTouched, setPayTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placed, setPlaced] = useState<{ id: string; orderNumber: string; total: number; paid: number } | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [leadNote, setLeadNote] = useState<string | null>(null);
  const [leadStart, setLeadStart] = useState<{ query: string; creating: ReturnType<typeof splitTyped> | null } | null>(null);
  const itemInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setToken(window.localStorage.getItem(TOKEN_KEY)); setInitialized(true); }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const [nextProfile, storeRows] = await Promise.all([loadProfile(authToken), apiRequest<Store[]>('/stores', { method: 'GET' }, authToken)]);
      setProfile(nextProfile);
      setStores(storeRows);
      setStoreId((current) => current || storeRows[0]?.id || '');
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  const canCreateOrder = hasPermission(profile, 'order.create');
  const canFindCustomers = hasPermission(profile, 'customer.read');
  const canAddCustomer = hasPermission(profile, 'customer.create');
  const canTag = hasPermission(profile, 'customer.update');
  const canPay = hasPermission(profile, 'order-payment.create');
  const inStore = channel === 'IN_STORE';

  // ---- the customer sets the price list --------------------------------------------------------------------------------
  function chooseCustomer(next: PickedCustomer | null) {
    setCustomer(next);
    if (next) { setWalkIn(false); setTier(next.priceTier); }
  }

  // Re-price every line that was not typed by hand whenever the price list changes.
  useEffect(() => {
    setLines((current) => current.map((line) => (line.priceEdited ? line : { ...line, unitPrice: tierPrice(line.option, tier) })));
  }, [tier]);

  // ---- items -----------------------------------------------------------------------------------------------------------
  function addOption(option: Option) {
    setLines((current) => {
      const at = current.findIndex((line) => line.option.variantId === option.variantId);
      if (at >= 0) return current.map((line, i) => (i === at ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { option, quantity: 1, unitPrice: tierPrice(option, tier), priceEdited: false, discount: 0, fulfillmentType: option.mustOrder ? 'SUPPLIER_ORDER' : 'STOCK' }];
    });
    // Straight back to the box, so the next item is typed without reaching for the mouse.
    setTimeout(() => itemInput.current?.focus(), 0);
  }
  const patchLine = (variantId: string, patch: Partial<Line>) => setLines((current) => current.map((line) => (line.option.variantId === variantId ? { ...line, ...patch } : line)));
  const removeLine = (variantId: string) => setLines((current) => current.filter((line) => line.option.variantId !== variantId));

  // A different shop has a different shelf: refresh what is sellable for each line.
  const lastStore = useRef('');
  useEffect(() => {
    if (!token || !storeId || lastStore.current === storeId) { lastStore.current = storeId; return; }
    lastStore.current = storeId;
    if (!lines.length) return;
    void Promise.all(lines.map((line) => apiRequest<Option[]>(`/products/variants/lookup?q=${encodeURIComponent(line.option.sku)}&storeId=${storeId}&limit=5`, { method: 'GET' }, token)
      .then((found) => found.find((o) => o.variantId === line.option.variantId)).catch(() => undefined))).then((fresh) => {
      setLines((current) => current.map((line) => {
        const option = fresh.find((o) => o?.variantId === line.option.variantId);
        return option ? { ...line, option, fulfillmentType: option.mustOrder ? 'SUPPLIER_ORDER' : line.fulfillmentType } : line;
      }));
    });
  }, [storeId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- money -----------------------------------------------------------------------------------------------------------
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.unitPrice * line.quantity - line.discount), 0);
  const discount = Math.min(subtotal, Math.max(0, num(orderDiscount)));
  const fee = inStore ? 0 : Math.max(0, num(shipping));
  const total = subtotal - discount + fee;

  // Until the person types an amount themselves, the payment is the whole total.
  useEffect(() => { if (!payTouched) setPay((p) => ({ ...p, amount: total > 0 ? String(Math.round(total * 100) / 100) : '' })); }, [total, payTouched]);
  const paying = pay.on && canPay && num(pay.amount) > 0;
  const paid = paying ? Math.min(total, num(pay.amount)) : 0;

  // ---- a cart lead being turned into an order --------------------------------------------------------------------------
  useEffect(() => {
    if (!token || !storeId) return;
    const leadId = new URLSearchParams(window.location.search).get('lead');
    if (!leadId || lead) return;
    void (async () => {
      try {
        const found = await apiRequest<Lead>(`/cart-leads/${leadId}`, { method: 'GET' }, token);
        setLead(found);
        if (found.source === 'WHATSAPP_ORDER') setChannel('WHATSAPP');
        if (found.shippingAddress) setAddress(found.shippingAddress);

        // The items: look each up again so prices and stock are today's, not the cart's.
        const options = await Promise.all(found.lines.map((l) => apiRequest<Option[]>(`/products/variants/lookup?q=${encodeURIComponent(l.sku)}&storeId=${storeId}&limit=5`, { method: 'GET' }, token)
          .then((rows) => rows.find((o) => o.variantId === l.variantId)).catch(() => undefined)));
        const missing = found.lines.filter((_, i) => !options[i]);
        setLines(found.lines.flatMap((l, i) => (options[i] ? [{ option: options[i] as Option, quantity: l.quantity, unitPrice: tierPrice(options[i] as Option, 'RETAIL'), priceEdited: false, discount: 0, fulfillmentType: (options[i] as Option).mustOrder ? 'SUPPLIER_ORDER' as Fulfilment : 'STOCK' as Fulfilment }] : [])));
        if (missing.length) setLeadNote(`${missing.map((m) => m.name).join(', ')} is no longer on sale, so it was left off.`);

        // The customer: use the one on file for this number or email, else start a new one with the lead's details.
        const probe = found.customerPhone || found.customerEmail || '';
        const matches = probe ? await apiRequest<PickedCustomer[]>(`/customers/lookup?q=${encodeURIComponent(probe)}`, { method: 'GET' }, token).catch(() => []) : [];
        if (matches.length === 1) chooseCustomer(matches[0]);
        else setLeadStart({ query: probe, creating: matches.length === 0 && (found.customerName || found.customerPhone) ? { ...splitTyped(found.customerName ?? ''), phone: found.customerPhone ?? '', email: found.customerEmail ?? '' } : null });
      } catch (error) {
        setErrorMessage(error);
      }
    })();
  }, [token, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- placing it ------------------------------------------------------------------------------------------------------
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!customer && !walkIn) out.push('Choose a customer, or ring up as a walk-in.');
    if (!lines.length) out.push('Add at least one item.');
    if (!inStore && !address.trim()) out.push('Add a delivery address, or change how it came in to In store.');
    if (pay.on && canPay && num(pay.amount) > total + 0.001) out.push('The payment is more than the total.');
    return out;
  }, [customer, walkIn, lines.length, inStore, address, pay.on, pay.amount, canPay, total]);

  // Leaving with items typed in would lose them.
  const dirty = lines.length > 0 && !placed;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function place(event: FormEvent) {
    event.preventDefault();
    if (!token || problems.length || saving) return;
    setSaving(true);
    try {
      const order = await apiRequest<{ id: string; orderNumber: string; total: string | number }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          storeId, channel, priceTier: tier,
          customerId: customer?.id,
          customerName: customer ? undefined : walkInInfo.name.trim() || undefined,
          customerPhone: customer ? undefined : walkInInfo.phone.trim() || undefined,
          shippingAddress: inStore ? undefined : address.trim(),
          shipping: fee || undefined,
          discount: discount || undefined,
          notes: notes.trim() || undefined,
          lines: lines.map((line) => ({
            variantId: line.option.variantId, quantity: line.quantity, fulfillmentType: line.fulfillmentType,
            // Only what was changed by hand is sent; otherwise the server prices it from the list, so the two can never disagree.
            ...(line.priceEdited ? { unitPrice: line.unitPrice } : {}),
            ...(line.discount ? { discount: line.discount } : {}),
          })),
        }),
      }, token);

      let recorded = 0;
      if (paying) {
        try {
          await apiRequest(`/orders/${order.id}/payments`, { method: 'POST', body: JSON.stringify({ amount: paid, method: pay.method, reference: pay.reference.trim() || undefined }) }, token);
          recorded = paid;
        } catch (error) {
          // The order is real either way; say the payment still needs recording rather than losing the sale.
          setErrorMessage(`The order was placed, but the payment was not recorded: ${error instanceof Error ? error.message : error}. Record it from the order.`);
        }
      }
      if (lead) await apiRequest(`/cart-leads/${lead.id}/convert`, { method: 'PATCH', body: JSON.stringify({ orderId: order.id }) }, token).catch(() => undefined);
      setPlaced({ id: order.id, orderNumber: order.orderNumber, total: Number(order.total), paid: recorded });
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  function startAgain() {
    setPlaced(null); setLines([]); setCustomer(null); setWalkIn(false); setWalkInInfo({ name: '', phone: '' }); setTier('RETAIL'); setAddress('');
    setShipping(''); setOrderDiscount(''); setNotes(''); setPayTouched(false); setPay({ on: true, method: 'MPESA', amount: '', reference: '' }); setChannel('IN_STORE');
    setLead(null); setLeadNote(null); setLeadStart(null);
    window.history.replaceState(null, '', '/portal/orders/new');
    window.scrollTo({ top: 0 });
  }

  // ---- the screen ------------------------------------------------------------------------------------------------------
  if (!initialized || loading) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card portal-loading">Loading…</article></section></main></EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card"><h2>Authentication required</h2><Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link></article>
      </section></main></EliteLayout>
    );
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="orders"
            pageTitle="New order"
            pageSubtitle="Key in a sale from a call, a DM or the counter."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {!canCreateOrder ? (
              <article className="portal-card"><h2>You cannot place orders</h2><p className="portal-muted">Ask an admin for the order.create permission.</p></article>
            ) : placed ? (
              <article className="portal-card pord-done">
                <h2>{placed.orderNumber} placed</h2>
                <p>{formatMoney(placed.total)}{placed.paid > 0 ? ` · ${formatMoney(placed.paid)} paid · ${formatMoney(Math.max(0, placed.total - placed.paid))} still to pay` : ' · nothing paid yet'}</p>
                <div className="portal-inline-actions">
                  <button type="button" className="portal-primary-btn" onClick={startAgain}>Key in another order</button>
                  <Link href={`/portal/orders/${placed.id}`} className="portal-ghost-btn">View the order</Link>
                  <Link href="/portal/orders" className="portal-ghost-btn">All orders</Link>
                </div>
              </article>
            ) : (
              <form className="pord" onSubmit={place} noValidate>
                <div className="pord-main">
                  {lead ? <p className="pord-lead">Ringing up a cart lead{lead.customerName ? ` from ${lead.customerName}` : ''}. {leadNote}</p> : null}

                  <section className="portal-card pord-section" data-tour="orders.customer">
                    <h2><span className="pord-step">1</span> Who is it for?</h2>
                    {walkIn ? (
                      <div className="pform">
                        <div className="pform-row">
                          <label className="pform-field"><span>Name <i>(optional)</i></span><input value={walkInInfo.name} autoComplete="off" onChange={(e) => setWalkInInfo((w) => ({ ...w, name: e.target.value }))} /></label>
                          <label className="pform-field"><span>Mobile <i>(optional)</i></span><input type="tel" inputMode="tel" placeholder="0712 345 678" value={walkInInfo.phone} autoComplete="off" onChange={(e) => setWalkInInfo((w) => ({ ...w, phone: e.target.value }))} /></label>
                        </div>
                        <p className="pcb-hint">A walk-in is not saved as a customer, so they will not be found next time. {canFindCustomers ? <button type="button" className="portal-inline-btn" onClick={() => setWalkIn(false)}>Search customers instead</button> : null}</p>
                      </div>
                    ) : canFindCustomers ? (
                      <CustomerPicker
                        token={token}
                        value={customer}
                        onChange={chooseCustomer}
                        canCreate={canAddCustomer}
                        canTag={canTag}
                        initialQuery={leadStart?.query ?? ''}
                        startCreating={leadStart?.creating ?? null}
                        onWalkIn={() => { setWalkIn(true); setCustomer(null); setTier('RETAIL'); }}
                        autoFocus={!lead}
                      />
                    ) : (
                      <p className="portal-muted">You cannot search customers, so this order will be a walk-in. <button type="button" className="portal-inline-btn" onClick={() => setWalkIn(true)}>Continue as a walk-in</button></p>
                    )}
                    {customer && tier !== customer.priceTier ? (
                      <p className="pcb-hint">This order is priced as <strong>{TIER_LABEL[tier]}</strong>, not the customer&apos;s usual {TIER_LABEL[customer.priceTier]}. <button type="button" className="portal-inline-btn" onClick={() => setTier(customer.priceTier)}>Use {TIER_LABEL[customer.priceTier]}</button></p>
                    ) : null}
                    {walkIn || !customer ? (
                      <div className="pform-field" style={{ marginTop: 12 }}>
                        <span className="pform-label">Price list for this order</span>
                        <TierTag value={tier} onChange={setTier} />
                      </div>
                    ) : null}
                  </section>

                  <section className="portal-card pord-section">
                    <h2><span className="pord-step">2</span> How did it come in?</h2>
                    <div className="pchips" role="radiogroup" aria-label="How the order came in">
                      {CHANNELS.map((c) => (
                        <button key={c.value} type="button" role="radio" aria-checked={channel === c.value} className={`pchip${channel === c.value ? ' is-on' : ''}`} onClick={() => setChannel(c.value)}>{c.label}</button>
                      ))}
                    </div>
                    {stores.length > 1 ? (
                      <label className="pform-field" style={{ marginTop: 12, maxWidth: 320 }}>
                        <span>Sold from</span>
                        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                      </label>
                    ) : null}
                  </section>

                  <section className="portal-card pord-section" data-tour="orders.items">
                    <h2><span className="pord-step">3</span> What do they want?</h2>
                    <Combobox<Option>
                      label="Add an item"
                      hint="Type any of: the name, brand, size or SKU, e.g. “air max 42”. Enter adds it; keep typing to add the next."
                      placeholder="Search products…"
                      value={itemQuery}
                      onValueChange={setItemQuery}
                      inputRef={itemInput}
                      clearOnSelect
                      minChars={2}
                      fetchOptions={(q, signal) => apiRequest<Option[]>(`/products/variants/lookup?q=${encodeURIComponent(q)}&storeId=${storeId}`, { method: 'GET', signal }, token)}
                      optionKey={(o) => o.variantId}
                      onSelect={addOption}
                      emptyText={(q) => `Nothing on sale matches “${q}”.`}
                      renderOption={(o) => (
                        <span className="pitem-row">
                          {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" /> : <span className="pitem-noimg" aria-hidden="true" />}
                          <span className="pitem-main">
                            <strong>{o.productName}</strong>
                            <span className="pcust-sub">{o.variantName.replace(o.productName, '').replace(/^[\s—-]+/, '') || o.sku} · {o.sku}</span>
                          </span>
                          <span className="pitem-side">
                            <strong>{formatMoney(tierPrice(o, tier))}</strong>
                            <span className={`pstock${o.mustOrder ? ' is-order' : o.sellable <= 3 ? ' is-low' : ''}`}>{o.mustOrder ? 'Order from supplier' : `${o.sellable} on shelf`}</span>
                          </span>
                        </span>
                      )}
                    />

                    {lines.length === 0 ? <p className="pord-empty">Nothing added yet.</p> : (
                      <ul className="pline-list">
                        {lines.map((line) => {
                          const list = tierPrice(line.option, tier);
                          const partial = line.fulfillmentType === 'STOCK' && line.quantity > line.option.sellable;
                          return (
                            <li key={line.option.variantId} className="pline">
                              <div className="pline-name">
                                <strong>{line.option.productName}</strong>
                                <span className="pcust-sub">{line.option.variantName.replace(line.option.productName, '').replace(/^[\s—-]+/, '') || line.option.sku}</span>
                                {line.fulfillmentType === 'SUPPLIER_ORDER' ? <span className="pstock is-order">From supplier</span> : null}
                                {partial ? (
                                  <span className="pline-warn">Only {line.option.sellable} on the shelf. <button type="button" className="portal-inline-btn" onClick={() => patchLine(line.option.variantId, { fulfillmentType: 'SUPPLIER_ORDER' })}>Order from the supplier instead</button></span>
                                ) : null}
                                {line.fulfillmentType === 'SUPPLIER_ORDER' && !line.option.mustOrder ? (
                                  <button type="button" className="portal-inline-btn" onClick={() => patchLine(line.option.variantId, { fulfillmentType: 'STOCK' })}>Take from the shelf instead</button>
                                ) : null}
                              </div>
                              <div className="pline-qty" aria-label="Quantity">
                                <button type="button" aria-label="One fewer" onClick={() => (line.quantity > 1 ? patchLine(line.option.variantId, { quantity: line.quantity - 1 }) : removeLine(line.option.variantId))}>−</button>
                                <input type="number" inputMode="numeric" min={1} value={line.quantity} onChange={(e) => patchLine(line.option.variantId, { quantity: Math.max(1, Math.floor(num(e.target.value)) || 1) })} />
                                <button type="button" aria-label="One more" onClick={() => patchLine(line.option.variantId, { quantity: line.quantity + 1 })}>+</button>
                              </div>
                              <label className="pline-price">
                                <span>Price</span>
                                <input type="number" inputMode="decimal" min={0} step="50" value={line.unitPrice}
                                  onChange={(e) => patchLine(line.option.variantId, { unitPrice: Math.max(0, num(e.target.value)), priceEdited: true })} />
                                {line.priceEdited && line.unitPrice !== list ? (
                                  <small>List {formatMoney(list)} · <button type="button" className="portal-inline-btn" onClick={() => patchLine(line.option.variantId, { unitPrice: list, priceEdited: false })}>reset</button></small>
                                ) : <small>{TIER_LABEL[tier]} price</small>}
                              </label>
                              <label className="pline-price">
                                <span>Discount</span>
                                <input type="number" inputMode="decimal" min={0} step="50" value={line.discount || ''} placeholder="0" onChange={(e) => patchLine(line.option.variantId, { discount: Math.max(0, num(e.target.value)) })} />
                              </label>
                              <div className="pline-total"><strong>{formatMoney(Math.max(0, line.unitPrice * line.quantity - line.discount))}</strong>
                                <button type="button" className="portal-inline-btn is-danger" onClick={() => removeLine(line.option.variantId)}>Remove</button></div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <section className="portal-card pord-section">
                    <h2><span className="pord-step">4</span> {inStore ? 'Anything to note?' : 'Where does it go?'}</h2>
                    {!inStore ? (
                      <div className="pform">
                        <label className="pform-field"><span>Delivery address <em>*</em></span><textarea rows={2} value={address} placeholder="Estate, street, landmark, and the rider’s phone if different" onChange={(e) => setAddress(e.target.value)} /></label>
                        <label className="pform-field" style={{ maxWidth: 240 }}><span>Delivery fee <i>(KES)</i></span><input type="number" inputMode="decimal" min={0} step="50" value={shipping} placeholder="0" onChange={(e) => setShipping(e.target.value)} /></label>
                      </div>
                    ) : null}
                    <label className="pform-field" style={{ marginTop: inStore ? 0 : 12 }}><span>Notes <i>(optional)</i></span><input value={notes} placeholder="e.g. collect Friday, size to be confirmed" onChange={(e) => setNotes(e.target.value)} /></label>
                  </section>

                  {canPay ? (
                    <section className="portal-card pord-section">
                      <h2><span className="pord-step">5</span> Payment</h2>
                      <label className="portal-check pord-check"><input type="checkbox" checked={pay.on} onChange={(e) => setPay((p) => ({ ...p, on: e.target.checked }))} /> <span>They have paid (or are paying a deposit) now</span></label>
                      {pay.on ? (
                        <div className="pform" style={{ marginTop: 12 }}>
                          <div className="pchips" role="radiogroup" aria-label="Payment method">
                            {METHODS.map((m) => <button key={m.value} type="button" role="radio" aria-checked={pay.method === m.value} className={`pchip${pay.method === m.value ? ' is-on' : ''}`} onClick={() => setPay((p) => ({ ...p, method: m.value }))}>{m.label}</button>)}
                          </div>
                          <div className="pform-row">
                            <label className="pform-field"><span>Amount received <i>(KES)</i></span><input type="number" inputMode="decimal" min={0} value={pay.amount} onChange={(e) => { setPayTouched(true); setPay((p) => ({ ...p, amount: e.target.value })); }} />
                              <small className="pcb-hint">
                                <button type="button" className="portal-inline-btn" onClick={() => { setPayTouched(false); }}>Full amount</button>{' · '}
                                <button type="button" className="portal-inline-btn" onClick={() => { setPayTouched(true); setPay((p) => ({ ...p, amount: String(Math.round(total / 2)) })); }}>Half</button>
                              </small>
                            </label>
                            <label className="pform-field"><span>{pay.method === 'MPESA' ? 'M-Pesa code' : 'Reference'} <i>(optional)</i></span><input value={pay.reference} autoCapitalize="characters" placeholder={pay.method === 'MPESA' ? 'e.g. SKH3A7B9XQ' : ''} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value.toUpperCase() }))} /></label>
                          </div>
                        </div>
                      ) : <p className="pcb-hint">The order is saved as unpaid; record payments later from the order.</p>}
                    </section>
                  ) : null}
                </div>

                <aside className="pord-side">
                  <div className="portal-card pord-summary">
                    <h2>Summary</h2>
                    <dl>
                      <div><dt>Customer</dt><dd>{customer ? `${customer.firstName} ${customer.lastName}` : walkIn ? (walkInInfo.name.trim() || 'Walk-in') : '—'}</dd></div>
                      <div><dt>Price list</dt><dd>{TIER_LABEL[tier]}</dd></div>
                      <div><dt>Items</dt><dd>{lines.reduce((n, l) => n + l.quantity, 0)}</dd></div>
                      <div><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
                      {lines.length > 0 ? (
                        <div><dt><label htmlFor="pord-discount">Order discount</label></dt><dd><input id="pord-discount" type="number" inputMode="decimal" min={0} step="50" value={orderDiscount} placeholder="0" onChange={(e) => setOrderDiscount(e.target.value)} /></dd></div>
                      ) : null}
                      {fee > 0 ? <div><dt>Delivery</dt><dd>{formatMoney(fee)}</dd></div> : null}
                      <div className="pord-total"><dt>Total</dt><dd>{formatMoney(total)}</dd></div>
                      {paying ? <div><dt>Paid now</dt><dd>{formatMoney(paid)}</dd></div> : null}
                      {paying ? <div><dt>Balance</dt><dd>{formatMoney(Math.max(0, total - paid))}</dd></div> : null}
                    </dl>
                    {problems.length ? <ul className="pord-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
                    <button type="submit" className="portal-primary-btn pord-place" disabled={saving || problems.length > 0}>{saving ? 'Placing…' : `Place order · ${formatMoney(total)}`}</button>
                    <Link href="/portal/orders" className="portal-ghost-btn pord-cancel">Cancel</Link>
                  </div>
                </aside>
              </form>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
