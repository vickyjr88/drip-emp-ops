"use client";

/**
 * "Put on offer", from wherever a product is listed.
 *
 * The offers screen is for deciding what to clear across the whole shop. This
 * is the other half: someone looking at one product, in the catalogue or in
 * inventory, who already knows it is not moving. Making them go and find it
 * again on another screen is how a feature ends up unused.
 *
 * It adds to an existing draft or live offer where one fits, because a shop
 * running "End of Season" wants the tenth item on that offer, not a tenth
 * offer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../accounting/lib';

export type OfferTarget = {
  variantId: string;
  sku: string;
  label: string;
  priceKes: number;
  costKes?: number | null;
};

type OfferSummary = {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  percentOff: number | null;
  fixedPriceKes: number | null;
  itemCount: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function OfferQuickAdd({
  target,
  token,
  onClose,
  onDone,
}: {
  target: OfferTarget;
  token: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [offerId, setOfferId] = useState('');
  const [name, setName] = useState('');
  const [label, setLabel] = useState('Clearance');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await apiRequest<{ items: OfferSummary[] }>('/offers?take=500', { method: 'GET' }, token);
      const rows = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? (page as unknown as OfferSummary[]) : [];
      // Ended offers cannot take new items; adding to one would look like it
      // worked and change no price.
      const open = rows.filter((row) => row && row.status !== 'ENDED');
      setOffers(open);
      if (open.length) {
        setMode('existing');
        setOfferId(open[0].id);
      }
    } catch {
      // Not fatal: a new offer can still be created.
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const chosen = offers.find((offer) => offer.id === offerId) || null;

  /** What this item would actually sell for, under whichever option is picked. */
  const price = useMemo(() => {
    if (mode === 'existing' && chosen) {
      if (chosen.fixedPriceKes !== null) return chosen.fixedPriceKes;
      if (chosen.percentOff !== null) return round2(target.priceKes * (1 - chosen.percentOff / 100));
      return null;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return null;
    return kind === 'percent' ? round2(target.priceKes * (1 - value / 100)) : value;
  }, [mode, chosen, amount, kind, target.priceKes]);

  const notCheaper = price !== null && price >= target.priceKes;
  const belowCost =
    price !== null && target.costKes !== null && target.costKes !== undefined && price < target.costKes;

  async function submit() {
    if (busy || price === null || notCheaper) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'existing') {
        if (!offerId) throw new Error('Pick an offer.');
        await apiRequest(`/offers/${offerId}/lines`, {
          method: 'POST',
          body: JSON.stringify({ lines: [{ variantId: target.variantId }] }),
        }, token);
        onDone(`${target.sku} added to "${chosen?.name}".`);
      } else {
        if (!name.trim()) throw new Error('Give the offer a name.');
        await apiRequest('/offers', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            label: label.trim() || undefined,
            ...(kind === 'percent'
              ? { percentOff: Number(amount) }
              : { fixedPriceKes: Number(amount) }),
            lines: [{ variantId: target.variantId }],
          }),
        }, token);
        onDone(`"${name.trim()}" created as a draft with ${target.sku}.`);
      }
      onClose();
    } catch (caught: any) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      try {
        const parsed = JSON.parse(raw);
        setError(Array.isArray(parsed.message) ? parsed.message[0] : parsed.message || raw);
      } catch {
        setError(raw);
      }
      setBusy(false);
    }
  }

  return (
    // Same shell as the confirm dialog, including click-outside to dismiss,
    // so this does not read as a different kind of thing.
    <div className="portal-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="portal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Put on offer"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="portal-dialog-title">Put on offer</h2>
        <p className="portal-muted" style={{ marginTop: 0 }}>
          {target.label} · {target.sku} · currently {target.priceKes.toLocaleString('en-KE')}
        </p>

        {error ? <div className="portal-error" style={{ marginBottom: 12 }}>{error}</div> : null}

        {offers.length ? (
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span>Offer</span>
            <select
              value={mode === 'new' ? '__new' : offerId}
              onChange={(event) => {
                if (event.target.value === '__new') { setMode('new'); return; }
                setMode('existing');
                setOfferId(event.target.value);
              }}
            >
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name} ({offer.status.toLowerCase()}, {offer.itemCount} item
                  {offer.itemCount === 1 ? '' : 's'})
                </option>
              ))}
              <option value="__new">＋ New offer…</option>
            </select>
          </label>
        ) : null}

        {mode === 'new' ? (
          <>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span>Name</span>
              <input value={name} placeholder="End of season clearance"
                onChange={(event) => setName(event.target.value)} />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span>Badge on the shop</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <div className="portal-entity-grid-2">
              <label>
                <span>Type</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as 'percent' | 'fixed')}>
                  <option value="percent">Percentage off</option>
                  <option value="fixed">Flat price</option>
                </select>
              </label>
              <label>
                <span>{kind === 'percent' ? 'Percent off' : 'Price (KES)'}</span>
                <input type="number" min="1" value={amount}
                  placeholder={kind === 'percent' ? '30' : '1500'}
                  onChange={(event) => setAmount(event.target.value)} />
              </label>
            </div>
          </>
        ) : null}

        {/* The resulting price, always shown: nobody should publish a markdown
            without seeing what it comes to. */}
        {price !== null ? (
          <p style={{ margin: '12px 0 0' }}>
            Would sell at <strong>{price.toLocaleString('en-KE')}</strong>
            {notCheaper ? (
              <span className="portal-muted"> — that is not cheaper than it is now.</span>
            ) : belowCost ? (
              <span className="portal-muted"> — below the {target.costKes?.toLocaleString('en-KE')} it cost.</span>
            ) : null}
          </p>
        ) : null}

        <div className="portal-dialog-actions" style={{ marginTop: 16 }}>
          <button type="button" className="portal-inline-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="portal-primary-btn"
            disabled={busy || price === null || notCheaper}
            onClick={() => void submit()}
          >
            {busy ? 'Saving…' : mode === 'existing' ? 'Add to offer' : 'Create draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
