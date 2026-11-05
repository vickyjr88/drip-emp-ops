"use client";

/**
 * Kits and Design Center, for staff: the on/off switch for the public line, the kits themselves, the clubs, and the
 * print queue of personalised orders. Everything here works while the public line is off, so the catalogue can be
 * prepared before the day it is turned on.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ImagePicker } from '../components/image-picker';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Status = { enabled: boolean; switchedOn: boolean; forcedOff: boolean; updatedBy: string | null; updatedAt: string | null };
type Kit = {
  id: string; slug: string; name: string; sku: string; isActive: boolean; isFeatured: boolean; imageUrls: string[] | null;
  kit: { kind: 'JERSEY' | 'TSHIRT'; club: { slug: string; name: string } | null; season: string | null; edition: string; templateKey: string; allowName: boolean; allowNumber: boolean; allowArtwork: boolean } | null;
  variants: Array<{ id: string; sku: string; name: string; priceKes: number; isActive: boolean; isDropShip: boolean }>;
};
type Club = { slug: string; name: string; league: string; isActive: boolean; kitCount: number };
type QueueRow = {
  id: string; orderNumber: string; orderStatus: string; customerName: string | null; customerPhone: string | null; placedAt: string;
  description: string; quantity: number; printFee: number; printStatus: string | null; printNotes: string | null;
  designToken: string | null; previewUrl: string | null; summary: string;
};

const TEMPLATES: Record<'JERSEY' | 'TSHIRT', Array<[string, string]>> = {
  JERSEY: [['jersey-short', 'Short-sleeve jersey'], ['jersey-long', 'Long-sleeve jersey'], ['jersey-retro', 'Retro collar jersey']],
  TSHIRT: [['tee-crew', 'Crew-neck T-shirt'], ['tee-vneck', 'V-neck T-shirt'], ['tee-oversized', 'Oversized T-shirt']],
};
const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
const STEPS: Array<[string, string]> = [['AWAITING_REVIEW', 'Awaiting review'], ['APPROVED', 'Approved'], ['PRINTED', 'Printed'], ['READY', 'Ready']];

type Tab = 'queue' | 'kits' | 'clubs';

export default function KitsPortalPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<Tab>('queue');
  const [kits, setKits] = useState<Kit[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [queueFilter, setQueueFilter] = useState('');
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();
  const [busy, setBusy] = useState(false);

  useEffect(() => { setToken(window.localStorage.getItem(TOKEN_KEY)); setInitialized(true); }, []);

  const loadAll = useCallback(async (authToken: string) => {
    try {
      const [s, k, c, q] = await Promise.all([
        apiRequest<Status>('/kits/admin/status', { method: 'GET' }, authToken),
        apiRequest<Kit[]>('/kits/admin/products', { method: 'GET' }, authToken),
        apiRequest<Club[]>('/kits/admin/clubs', { method: 'GET' }, authToken),
        apiRequest<QueueRow[]>(`/kits/admin/print-queue${queueFilter ? `?status=${queueFilter}` : ''}`, { method: 'GET' }, authToken).catch(() => [] as QueueRow[]),
      ]);
      setStatus(s); setKits(k); setClubs(c); setQueue(q);
    } catch (error) {
      setErrorMessage(error);
    }
  }, [queueFilter, setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void (async () => {
      try { setProfile(await loadProfile(token)); } catch (error) { setErrorMessage(error); } finally { setLoading(false); }
    })();
  }, [initialized, token, setErrorMessage]);

  useEffect(() => { if (token && profile) void loadAll(token); }, [token, profile, loadAll]);

  // The same permission that edits Site content (the server enforces it too): whoever can change the site can switch Kits.
  const canSwitch = hasPermission(profile, 'page-content.update');

  async function flip(next: boolean) {
    if (!token) return;
    const ok = await dialog.confirm({
      title: next ? 'Turn on Kits and Design Center?' : 'Turn off Kits and Design Center?',
      message: next
        ? 'The Kits page, design center, club pages, feeds and sitemap entries go live on the public site, and a Kits link appears in the menu and footer.'
        : 'Every public Kits page, the design center, the feeds and the menu links disappear at once. Orders already placed and the print queue are not affected, and you can turn it back on at any time.',
      confirmLabel: next ? 'Turn on' : 'Turn off',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setStatus(await apiRequest<Status>('/kits/admin/status', { method: 'PUT', body: JSON.stringify({ enabled: next }) }, token));
      setFeedback(next ? 'Kits are now live on the site.' : 'Kits are now hidden from the site.');
    } catch (error) { setErrorMessage(error); } finally { setBusy(false); }
  }

  async function patchKit(id: string, body: Record<string, unknown>) {
    if (!token) return;
    try {
      await apiRequest(`/kits/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
      await loadAll(token);
    } catch (error) { setErrorMessage(error); }
  }
  async function patchClub(slug: string, body: Record<string, unknown>) {
    if (!token) return;
    try {
      await apiRequest(`/kits/admin/clubs/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
      await loadAll(token);
    } catch (error) { setErrorMessage(error); }
  }
  async function setPrint(id: string, printStatus: string, notes?: string) {
    if (!token) return;
    try {
      await apiRequest(`/kits/admin/print-queue/${id}`, { method: 'PATCH', body: JSON.stringify({ status: printStatus, ...(notes !== undefined ? { notes } : {}) }) }, token);
      await loadAll(token);
    } catch (error) { setErrorMessage(error); }
  }

  if (!initialized || loading) {
    return <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card portal-loading">Loading…</article></section></main></EliteLayout>;
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card"><h2>Authentication required</h2><Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link></article>
      </section></main></EliteLayout>
    );
  }

  const waiting = queue.filter((r) => r.printStatus === 'AWAITING_REVIEW').length;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="kits"
            pageSubtitle="Jerseys and custom T-shirts: the public switch, the shirts, the clubs and the print queue."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void loadAll(token)}
          >
            <div className="kp-stack">
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className={`portal-card kp-switch ${status?.enabled ? 'is-on' : 'is-off'}`}>
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Public site: {status?.enabled ? 'ON' : 'OFF'}</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0', maxWidth: '62ch' }}>
                    {status?.enabled
                      ? 'Shoppers can see the Kits page, the design center and the club pages, and order personalised shirts.'
                      : 'Nothing about Kits is visible on the public site: no pages, no menu link, no feed, no sitemap entries. You can still prepare everything below.'}
                  </p>
                  {status?.forcedOff ? <p className="portal-error" style={{ margin: '8px 0 0' }}>An emergency override on the server (KITS_ENABLED=false) is holding Kits off, whatever this switch says. Ask whoever runs the server to remove it.</p> : null}
                  {status?.updatedAt ? <p className="portal-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Last changed {formatDateTime(status.updatedAt)}{status.updatedBy ? ` by ${status.updatedBy}` : ''}.</p> : <p className="portal-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Never switched on yet.</p>}
                </div>
                <div className="portal-action-row">
                  <button type="button" className="portal-primary-btn" disabled={busy || !canSwitch || !status} onClick={() => void flip(!status?.switchedOn)} title={canSwitch ? undefined : 'You need permission to edit site content to change this.'}>
                    {status?.switchedOn ? 'Turn off' : 'Turn on'}
                  </button>
                  <Link href="/portal/content" className="portal-ghost-btn">Print fees and wording</Link>
                </div>
              </div>
            </article>

            <div className="kp-tabs" role="tablist">
              {([['queue', `Print queue${waiting ? ` (${waiting})` : ''}`], ['kits', `Kits (${kits.length})`], ['clubs', `Clubs (${clubs.length})`]] as Array<[Tab, string]>).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>{label}</button>
              ))}
            </div>

            {tab === 'queue' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Personalised orders</h2>
                  <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)} aria-label="Filter by status">
                    <option value="">All</option>
                    {STEPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <p className="portal-muted">Check each name and number before it is printed: customers type this text. Approve, print, then mark ready.</p>
                {queue.length === 0 ? <div className="portal-empty-state">No personalised orders yet.</div> : (
                  <div className="kp-queue">
                    {queue.map((row) => (
                      <div key={row.id} className="kp-row">
                        {row.previewUrl ? <a href={row.previewUrl} target="_blank" rel="noreferrer"><img src={row.previewUrl} alt={`Preview for order ${row.orderNumber}`} /></a> : <div className="kp-nopreview">No preview</div>}
                        <div>
                          <h3>{row.orderNumber} · {row.description} × {row.quantity}</h3>
                          <p className="kp-summary">{row.summary || 'No print details'}</p>
                          <p className="portal-muted">{row.customerName || 'Customer'}{row.customerPhone ? ` · ${row.customerPhone}` : ''} · {formatDateTime(row.placedAt)} · print fee KSh {Math.round(row.printFee).toLocaleString('en-KE')}</p>
                          <div className="kp-steps" role="group" aria-label="Print status">
                            {STEPS.map(([k, l]) => <button key={k} type="button" className={row.printStatus === k ? 'is-on' : ''} onClick={() => void setPrint(row.id, k)}>{l}</button>)}
                          </div>
                          <input className="kp-notes" defaultValue={row.printNotes ?? ''} placeholder="Notes for the print shop…" aria-label="Notes" onBlur={(e) => { if ((row.printNotes ?? '') !== e.target.value) void setPrint(row.id, row.printStatus ?? 'AWAITING_REVIEW', e.target.value); }} />
                          <p>{row.designToken ? <a href={`/design/${row.designToken}`} target="_blank" rel="noreferrer">Open the design</a> : null}{row.customerPhone ? <> · <a href={`https://wa.me/${row.customerPhone.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp the customer</a></> : null}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ) : null}

            {tab === 'kits' ? <KitsTab token={token} kits={kits} clubs={clubs} onChanged={() => void loadAll(token)} patchKit={patchKit} setError={setErrorMessage} setFeedback={setFeedback} /> : null}

            {tab === 'clubs' ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Clubs and teams</h2>
                <p className="portal-muted">Switch clubs on or off for the new season. A club that is off is not offered in the design center and has no page. Existing kits keep working.</p>
                <div className="kp-clubs">
                  {clubs.map((club) => (
                    <label key={club.slug} className={club.isActive ? '' : 'is-off'}>
                      <input type="checkbox" checked={club.isActive} onChange={(e) => void patchClub(club.slug, { isActive: e.target.checked })} />
                      <span>{club.name}</span>
                      <small>{club.league.replace('_', ' ')}{club.kitCount ? ` · ${club.kitCount} kit${club.kitCount === 1 ? '' : 's'}` : ''}</small>
                    </label>
                  ))}
                </div>
              </article>
            ) : null}
            </div>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}

function KitsTab({ token, kits, clubs, onChanged, patchKit, setError, setFeedback }: {
  token: string; kits: Kit[]; clubs: Club[]; onChanged: () => void;
  patchKit: (id: string, body: Record<string, unknown>) => Promise<void>;
  setError: (e: unknown) => void; setFeedback: (m: string) => void;
}) {
  const [kind, setKind] = useState<'JERSEY' | 'TSHIRT'>('JERSEY');
  const [name, setName] = useState('');
  const [clubSlug, setClubSlug] = useState('');
  const [edition, setEdition] = useState('HOME');
  const [season, setSeason] = useState('2025/26');
  const [templateKey, setTemplateKey] = useState('jersey-short');
  const [description, setDescription] = useState('');
  const [sizes, setSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [price, setPrice] = useState('3500');
  const [dropShip, setDropShip] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTemplateKey(TEMPLATES[kind][0][0]); if (kind === 'TSHIRT') { setClubSlug(''); setEdition('NONE'); } else setEdition('HOME'); }, [kind]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/kits/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          name, kind, templateKey, description: description || undefined, imageUrls: images,
          ...(kind === 'JERSEY' && clubSlug ? { clubSlug, edition, season: season || undefined } : {}),
          ...(kind === 'TSHIRT' ? { colors: { primary: '#f5f5f2', secondary: '#161616', trim: '#161616', pattern: 'solid', sleeves: 'primary' } } : {}),
          sizes: sizes.map((size) => ({ size, priceKes: Number(price), isDropShip: dropShip })),
        }),
      }, token);
      setFeedback('Kit created. Add stock in Inventory if you hold blanks.');
      setName(''); setDescription(''); setImages([]);
      onChanged();
    } catch (error) { setError(error); } finally { setSaving(false); }
  }

  return (
    <>
      <article className="portal-card">
        <h2 style={{ marginTop: 0 }}>Add a kit</h2>
        <p className="portal-muted">Create the shirt a shopper can buy or personalise. Sizes become normal stock-keeping variants, so stock, orders and reports work as for any product. Leave the club empty for the generic &ldquo;Custom jersey&rdquo; that any club&rsquo;s design is ordered on, or for a plain T-shirt.</p>
        <form onSubmit={create} className="kp-form">
          <label>Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Arsenal Home Jersey 2025/26 (Fan Version)" /></label>
          <label>Type<select value={kind} onChange={(e) => setKind(e.target.value as 'JERSEY' | 'TSHIRT')}><option value="JERSEY">Football jersey</option><option value="TSHIRT">T-shirt</option></select></label>
          {kind === 'JERSEY' ? (
            <>
              <label>Club<select value={clubSlug} onChange={(e) => setClubSlug(e.target.value)}><option value="">Generic (any club)</option>{clubs.filter((c) => c.isActive).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
              <label>Kit<select value={edition} onChange={(e) => setEdition(e.target.value)}><option value="HOME">Home</option><option value="AWAY">Away</option><option value="THIRD">Third</option><option value="RETRO">Retro</option></select></label>
              <label>Season<input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025/26" /></label>
            </>
          ) : null}
          <label>Shirt shape<select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>{TEMPLATES[kind].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Price per shirt, before printing (KES)<input required type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <fieldset><legend>Sizes</legend>{ALL_SIZES.map((s) => <label key={s} className="kp-inline"><input type="checkbox" checked={sizes.includes(s)} onChange={(e) => setSizes((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} />{s}</label>)}</fieldset>
          <label className="kp-inline"><input type="checkbox" checked={dropShip} onChange={(e) => setDropShip(e.target.checked)} />Sourced from the supplier for each order (untick if you hold stock)</label>
          <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Fan-version shirt in club colours…" /></label>
          <div>
            <div className="portal-action-row"><button type="button" className="portal-ghost-btn" onClick={() => setPicking(true)}>Choose photos</button><span className="portal-muted">{images.length ? `${images.length} chosen` : 'Optional: without a photo the drawn shirt is used.'}</span></div>
          </div>
          <button type="submit" className="portal-primary-btn" disabled={saving || !name || sizes.length === 0}>{saving ? 'Creating…' : 'Create kit'}</button>
        </form>
        <ImagePicker open={picking} token={token} multiple title="Choose kit photos" onClose={() => setPicking(false)} onSelect={(urls) => setImages((cur) => Array.from(new Set([...cur, ...urls])))} usedUrls={images} />
      </article>

      <article className="portal-card">
        <h2 style={{ marginTop: 0 }}>Kits</h2>
        {kits.length === 0 ? <div className="portal-empty-state">No kits yet. Add one above.</div> : (
          <table className="portal-table">
            <thead><tr><th>Kit</th><th>Club</th><th>Sizes and price</th><th>Public</th><th /></tr></thead>
            <tbody>
              {kits.map((k) => (
                <tr key={k.id}>
                  <td><strong>{k.name}</strong><br /><small>{k.sku}{k.kit ? ` · ${k.kit.kind === 'JERSEY' ? 'Jersey' : 'T-shirt'}` : ''}</small></td>
                  <td>{k.kit?.club?.name ?? 'Generic'}{k.kit?.edition && k.kit.edition !== 'NONE' ? ` · ${k.kit.edition.toLowerCase()}` : ''}</td>
                  <td>{k.variants.map((v) => v.name).join(', ')}<br /><small>from KSh {Math.min(...k.variants.map((v) => v.priceKes)).toLocaleString('en-KE')}{k.variants.some((v) => v.isDropShip) ? ' · supplier-sourced' : ''}</small></td>
                  <td><label className="kp-inline"><input type="checkbox" checked={k.isActive} onChange={(e) => void patchKit(k.id, { isActive: e.target.checked })} />Listed</label></td>
                  <td><Link href={`/portal/catalogue`} className="portal-ghost-btn">Edit stock and prices</Link> <Link href={`/kits/${k.slug}`} target="_blank" className="portal-ghost-btn">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}
