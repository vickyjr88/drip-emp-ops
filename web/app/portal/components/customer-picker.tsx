"use client";

/**
 * Choosing who an order is for, from the till: one box that takes a name, a mobile number in any format, or an email. Results come from the
 * server as you type (so it works with any number of customers, not the first 500), the customers who buy most first.
 *
 * Most orders are keyed in by hand after the fact (a call, a DM, someone at the counter), so this is built for speed and for not making duplicates:
 *  - typing something that is not on file offers "Add as a new customer" with the box's text already sorted into name, number and email;
 *  - a number or email that is already on file answers "that is Wanjiku" and offers to use her, instead of making a second record;
 *  - the customer can be tagged Retail, Reseller or Wholesale right here, which sets the price list the order uses.
 */

import { useEffect, useRef, useState } from 'react';
import { apiRequest, formatDateTime } from '../accounting/lib';
import { Combobox } from './combobox';

export type Tier = 'RETAIL' | 'RESELLER' | 'WHOLESALE';
export type PickedCustomer = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string;
  priceTier: Tier; businessName?: string | null; orders?: number; lastOrderAt?: string | null;
};

export const TIER_LABEL: Record<Tier, string> = { RETAIL: 'Retail', RESELLER: 'Reseller', WHOLESALE: 'Wholesale' };
const TIER_HELP: Record<Tier, string> = {
  RETAIL: 'Pays the normal shelf price.',
  RESELLER: 'Buys to resell: gets the reseller price list.',
  WHOLESALE: 'Buys in volume: gets the wholesale price list.',
};

/** Sorts what was typed in the box into the fields of a new customer: digits are the number, an @ makes it the email, the words are the name. */
export function splitTyped(text: string): { firstName: string; lastName: string; phone: string; email: string } {
  const words: string[] = [];
  const digitTokens: string[] = [];
  let email = '';
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    if (token.includes('@')) email = token;
    else if (/^[+\d()-]+$/.test(token) && /\d/.test(token)) digitTokens.push(token);
    else words.push(token);
  }
  const titled = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return { firstName: titled(words[0] ?? ''), lastName: words.slice(1).map(titled).join(' '), phone: digitTokens.join(' '), email };
}

/** A segmented Retail / Reseller / Wholesale control. Larger than a dropdown because it is tapped dozens of times a day. */
export function TierTag({ value, onChange, disabled, busy }: { value: Tier; onChange: (tier: Tier) => void; disabled?: boolean; busy?: boolean }) {
  return (
    <div>
      <div className="ptier" role="radiogroup" aria-label="Customer type">
        {(Object.keys(TIER_LABEL) as Tier[]).map((tier) => (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={value === tier}
            className={`ptier-opt${value === tier ? ' is-on' : ''}${tier !== 'RETAIL' ? ' is-trade' : ''}`}
            disabled={disabled || busy}
            onClick={() => { if (tier !== value) onChange(tier); }}
          >
            {TIER_LABEL[tier]}
          </button>
        ))}
      </div>
      <small className="pcb-hint">{TIER_HELP[value]}{disabled ? ' (You do not have permission to change this.)' : ''}</small>
    </div>
  );
}

type Props = {
  token: string;
  /** The chosen customer, or null while none is. */
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  /** Staff without customer.create cannot add one; without customer.update they cannot change a tier. */
  canCreate: boolean;
  canTag: boolean;
  /** Seeds the box, e.g. from a cart lead's phone number. */
  initialQuery?: string;
  /** Opens the new-customer form straight away with these values (a lead with no matching customer). */
  startCreating?: Partial<ReturnType<typeof splitTyped>> | null;
  /** The person is not a customer: the order is rung up under a typed name and number. */
  onWalkIn?: () => void;
  autoFocus?: boolean;
};

function parseError(error: unknown): { message: string; existing?: PickedCustomer } {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const body = JSON.parse(raw);
    const message = Array.isArray(body.message) ? body.message.join(', ') : String(body.message ?? raw);
    return { message, existing: body.existing };
  } catch {
    return { message: raw };
  }
}

export function CustomerPicker({ token, value, onChange, canCreate, canTag, initialQuery = '', startCreating = null, onWalkIn, autoFocus }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [creating, setCreating] = useState<ReturnType<typeof splitTyped> | null>(startCreating ? { firstName: '', lastName: '', phone: '', email: '', ...startCreating } : null);

  if (value) return <SelectedCustomer token={token} customer={value} canTag={canTag} onChange={onChange} onClear={() => { onChange(null); setQuery(''); }} />;

  if (creating) {
    return (
      <NewCustomer
        token={token}
        initial={creating}
        canTag={canTag}
        onCancel={() => setCreating(null)}
        onCreated={(customer) => { setCreating(null); onChange(customer); }}
      />
    );
  }

  return (
    <div>
      <Combobox<PickedCustomer>
        label="Customer"
        hint="Type a name, a mobile number (0712…, +254712…) or an email."
        placeholder="Search customers…"
        value={query}
        onValueChange={setQuery}
        minChars={2}
        autoFocus={autoFocus}
        fetchOptions={(q, signal) => apiRequest<PickedCustomer[]>(`/customers/lookup?q=${encodeURIComponent(q)}`, { method: 'GET', signal }, token)}
        optionKey={(customer) => customer.id}
        onSelect={(customer) => onChange(customer)}
        renderOption={(customer) => (
          <span className="pcust-row">
            <span className="pcust-main">
              <strong>{customer.firstName} {customer.lastName}</strong>
              {customer.businessName ? <span className="pcust-biz"> · {customer.businessName}</span> : null}
              {customer.priceTier !== 'RETAIL' ? <span className={`pcust-tier is-${customer.priceTier.toLowerCase()}`}>{TIER_LABEL[customer.priceTier]}</span> : null}
            </span>
            <span className="pcust-sub">
              {[customer.phone, customer.email].filter(Boolean).join(' · ')}
              {customer.orders ? ` · ${customer.orders} order${customer.orders === 1 ? '' : 's'}${customer.lastOrderAt ? `, last ${formatDateTime(customer.lastOrderAt).split(',')[0]}` : ''}` : ' · no orders yet'}
            </span>
          </span>
        )}
        emptyText={(q) => `Nobody on file matches “${q}”.`}
        action={canCreate ? { label: (q) => `+ Add “${q}” as a new customer`, onSelect: (q) => setCreating(splitTyped(q)) } : undefined}
      />
      {onWalkIn ? (
        <button type="button" className="portal-inline-btn pcust-walkin" onClick={onWalkIn}>Not a customer? Ring up as a walk-in</button>
      ) : null}
    </div>
  );
}

/** The chosen customer: who, how to reach them, how often they buy, and the price list they are on, changeable in one tap. */
function SelectedCustomer({ token, customer, canTag, onChange, onClear }: { token: string; customer: PickedCustomer; canTag: boolean; onChange: (c: PickedCustomer) => void; onClear: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState(customer.businessName ?? '');
  useEffect(() => { setBusiness(customer.businessName ?? ''); }, [customer.id, customer.businessName]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<PickedCustomer>(`/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
      onChange({ ...customer, ...updated, email: customer.email });
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pcust-card">
      <div className="pcust-card-head">
        <div>
          <strong className="pcust-name">{customer.firstName} {customer.lastName}</strong>
          {customer.businessName ? <span className="pcust-biz"> · {customer.businessName}</span> : null}
          <div className="pcust-sub">
            {[customer.phone, customer.email].filter(Boolean).join(' · ')}
            {customer.orders ? ` · ${customer.orders} order${customer.orders === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <button type="button" className="portal-inline-btn" onClick={onClear}>Change</button>
      </div>
      <TierTag value={customer.priceTier} disabled={!canTag} busy={saving} onChange={(tier) => void patch({ priceTier: tier })} />
      {customer.priceTier !== 'RETAIL' ? (
        <label className="pcust-biz-field">
          <span>Business</span>
          <input
            value={business}
            placeholder="Shop or business name (optional)"
            disabled={!canTag}
            onChange={(event) => setBusiness(event.target.value)}
            onBlur={() => { if (business.trim() !== (customer.businessName ?? '')) void patch({ businessName: business.trim() }); }}
          />
        </label>
      ) : null}
      {error ? <p className="pform-error" role="alert">{error}</p> : null}
    </div>
  );
}

/** Adds a customer without leaving the order. */
function NewCustomer({ token, initial, canTag, onCancel, onCreated }: { token: string; initial: ReturnType<typeof splitTyped>; canTag: boolean; onCancel: () => void; onCreated: (c: PickedCustomer) => void }) {
  const [form, setForm] = useState({ ...initial, tier: 'RETAIL' as Tier, businessName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<PickedCustomer | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  // Start on the first field still empty, so a typed number leaves the cursor on the name and a typed name on the number.
  useEffect(() => { (initial.firstName ? phoneRef.current : firstRef.current)?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const digits = form.phone.replace(/\D/g, '');
  const problem = !form.firstName.trim() ? 'First name is needed.' : !form.lastName.trim() ? 'Last name is needed (a single word is fine for a walk-in, but the record wants both).' : digits.length < 9 ? 'Enter the mobile number, at least 9 digits (0712 345 678).' : form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? 'That email does not look right.' : null;
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setError(null); setExisting(null); };

  // Not a <form>: this sits inside the order screen's own form, and forms cannot nest (submitting reloaded the whole page).
  async function submit() {
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await apiRequest<PickedCustomer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined,
          priceTier: canTag ? form.tier : undefined, businessName: form.tier !== 'RETAIL' && form.businessName.trim() ? form.businessName.trim() : undefined,
        }),
      }, token);
      onCreated({ ...created, email: form.email.trim() || null });
    } catch (e) {
      const parsed = parseError(e);
      setError(parsed.message);
      if (parsed.existing) setExisting(parsed.existing);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="pform pcust-new"
      onKeyDown={(event) => {
        // Enter in a text box adds the customer, as it would in a form; buttons keep their own Enter.
        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); void submit(); }
      }}
    >
      <div className="pcust-card-head"><strong>New customer</strong><button type="button" className="portal-inline-btn" onClick={onCancel}>Cancel</button></div>
      <div className="pform-row">
        <label className="pform-field"><span>First name <em>*</em></span><input ref={firstRef} value={form.firstName} autoComplete="off" onChange={(e) => set({ firstName: e.target.value })} /></label>
        <label className="pform-field"><span>Last name <em>*</em></span><input value={form.lastName} autoComplete="off" onChange={(e) => set({ lastName: e.target.value })} /></label>
      </div>
      <div className="pform-row">
        <label className="pform-field"><span>Mobile <em>*</em></span><input ref={phoneRef} type="tel" inputMode="tel" placeholder="0712 345 678" value={form.phone} autoComplete="off" onChange={(e) => set({ phone: e.target.value })} /></label>
        <label className="pform-field"><span>Email <i>(optional)</i></span><input type="email" inputMode="email" placeholder="Leave blank if they do not have one" value={form.email} autoComplete="off" onChange={(e) => set({ email: e.target.value })} /></label>
      </div>
      <div className="pform-field">
        <span className="pform-label">Customer type</span>
        <TierTag value={form.tier} disabled={!canTag} onChange={(tier) => set({ tier })} />
      </div>
      {form.tier !== 'RETAIL' ? (
        <label className="pform-field"><span>Business <i>(optional)</i></span><input value={form.businessName} placeholder="Shop or business name" onChange={(e) => set({ businessName: e.target.value })} /></label>
      ) : null}

      {error ? (
        <div className="pform-error" role="alert">
          {error}
          {existing ? <button type="button" className="portal-inline-btn" onClick={() => onCreated(existing)}>Use {existing.firstName} {existing.lastName}</button> : null}
        </div>
      ) : null}
      <div className="pform-actions">
        <button type="button" className="portal-primary-btn" disabled={busy} onClick={() => void submit()}>{busy ? 'Adding…' : 'Add and use for this order'}</button>
      </div>
    </div>
  );
}
