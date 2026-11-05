"use client";

/**
 * Watches, for staff. Watches are their own section of the site (not part of the shoe shop, its feeds or its filters), and
 * a watch has no size: adding one asks for a name, a price and photos, and only offers choices (a strap or dial colour)
 * if the model comes in more than one version.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ImagePicker } from '../components/image-picker';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Watch = {
  id: string; slug: string; name: string; brand: string | null; sku: string; isActive: boolean; isFeatured: boolean; imageUrls: string[] | null;
  variants: Array<{ id: string; sku: string; name: string; priceKes: number; isActive: boolean; isDropShip: boolean }>;
};

export default function WatchesPortalPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [options, setOptions] = useState('');
  const [dropShip, setDropShip] = useState(false);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setToken(window.localStorage.getItem(TOKEN_KEY)); setInitialized(true); }, []);

  const load = useCallback(async (authToken: string) => {
    try { setWatches(await apiRequest<Watch[]>('/watches/admin/products', { method: 'GET' }, authToken)); } catch (error) { setErrorMessage(error); }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void (async () => {
      try { setProfile(await loadProfile(token)); } catch (error) { setErrorMessage(error); } finally { setLoading(false); }
    })();
  }, [initialized, token, setErrorMessage]);
  useEffect(() => { if (token && profile) void load(token); }, [token, profile, load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const choices = options.split(',').map((o) => o.trim()).filter(Boolean);
      await apiRequest('/watches/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          name, brand: brand || undefined, priceKes: Number(price), ...(cost ? { costKes: Number(cost) } : {}),
          ...(choices.length ? { options: choices } : {}), isDropShip: dropShip, description: description || undefined, imageUrls: images,
        }),
      }, token);
      setFeedback('Watch added. Add stock in Inventory if you hold it.');
      setName(''); setBrand(''); setPrice(''); setCost(''); setOptions(''); setDescription(''); setImages([]);
      await load(token);
    } catch (error) { setErrorMessage(error); } finally { setSaving(false); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (!token) return;
    try { await apiRequest(`/watches/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token); await load(token); } catch (error) { setErrorMessage(error); }
  }

  if (!initialized || loading) {
    return <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card portal-loading">Loading…</article></section></main></EliteLayout>;
  }
  if (!token || !profile) {
    return <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card"><h2>Authentication required</h2><Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link></article></section></main></EliteLayout>;
  }
  const canCreate = hasPermission(profile, 'product.create');

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="watches"
            pageSubtitle="Watches have their own section on the site, separate from shoes. A watch has no size."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            <div className="kp-stack">
              {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Add a watch</h2>
                <p className="portal-muted" style={{ maxWidth: '66ch' }}>
                  Anything in the Watches category is a watch: it appears under Watches on the site and in the watches feed, never in the shoe shop or the shoe feeds.
                  Leave &ldquo;choices&rdquo; empty for a watch that comes one way; fill it in only if there is a real choice such as a strap colour.
                </p>
                {canCreate ? (
                  <form onSubmit={create} className="kp-form">
                    <label>Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Bagolee Chronograph Black" /></label>
                    <label>Brand<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Bagolee" /></label>
                    <label>Price (KES)<input required type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                    <label>Buying cost (KES, optional, never shown to customers)<input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></label>
                    <label>Choices (optional, separated by commas)<input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Black strap, Brown strap" /></label>
                    <label className="kp-inline"><input type="checkbox" checked={dropShip} onChange={(e) => setDropShip(e.target.checked)} />Sourced from the supplier for each order (leave unticked if you hold stock)</label>
                    <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
                    <div className="portal-action-row">
                      <button type="button" className="portal-ghost-btn" onClick={() => setPicking(true)}>Choose photos</button>
                      <span className="portal-muted">{images.length ? `${images.length} chosen` : 'Photos show on the watch page and in the feed.'}</span>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={saving || !name || !price}>{saving ? 'Adding…' : 'Add watch'}</button>
                  </form>
                ) : <p className="portal-muted">You do not have permission to add products.</p>}
                <ImagePicker open={picking} token={token} multiple title="Choose watch photos" onClose={() => setPicking(false)} onSelect={(urls) => setImages((cur) => Array.from(new Set([...cur, ...urls])))} usedUrls={images} />
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Watches ({watches.length})</h2>
                  <Link href="/watches" target="_blank" className="portal-ghost-btn">View the section</Link>
                </div>
                {watches.length === 0 ? <div className="portal-empty-state">No watches yet. Add one above.</div> : (
                  <table className="portal-table">
                    <thead><tr><th>Watch</th><th>Price</th><th>Choices</th><th>Listed</th><th>Featured</th><th /></tr></thead>
                    <tbody>
                      {watches.map((w) => (
                        <tr key={w.id}>
                          <td><strong>{w.name}</strong><br /><small>{w.brand ?? 'No brand'} · {w.sku}</small></td>
                          <td>KSh {Math.min(...w.variants.map((v) => v.priceKes)).toLocaleString('en-KE')}</td>
                          <td>{w.variants.length > 1 ? w.variants.map((v) => v.name).join(', ') : 'None'}</td>
                          <td><label className="kp-inline"><input type="checkbox" checked={w.isActive} onChange={(e) => void patch(w.id, { isActive: e.target.checked })} />On sale</label></td>
                          <td><label className="kp-inline"><input type="checkbox" checked={w.isFeatured} onChange={(e) => void patch(w.id, { isFeatured: e.target.checked })} />Featured</label></td>
                          <td><Link href="/portal/catalogue" className="portal-ghost-btn">Edit stock and prices</Link> <Link href={`/watches/${w.slug}`} target="_blank" className="portal-ghost-btn">View</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </article>
            </div>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
