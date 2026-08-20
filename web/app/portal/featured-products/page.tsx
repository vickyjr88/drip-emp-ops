"use client";

/**
 * Featured Products: what the merchant wants leading the home page's
 * "Featured" rail, the shop, and each product's own detail page.
 *
 * Kept as its own screen rather than a column on the Catalogue table because
 * this is a curation decision, not a stock/pricing edit -- separating it
 * means someone picking today's featured lineup does not have to wade
 * through variant grids and pricing tiers to find the one toggle they want.
 *
 * The list always shows every active product, featured ones first, so a
 * picker can see what is currently on the rail and what else is available in
 * the same place rather than switching between "current" and "everything".
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListThumb } from '../components/list-thumb';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Product = {
  id: string; name: string; brand?: string | null;
  imageUrls?: string[] | null; featuredImageUrl?: string | null;
  isFeatured: boolean;
  category?: { name: string } | null;
};

export default function FeaturedProductsPage() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setProfileLoading(false); return; }
    void loadProfile(token)
      .then(setProfile)
      .catch((error) => setErrorMessage(error))
      .finally(() => setProfileLoading(false));
    // setErrorMessage is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, token]);

  const fetchProductsPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<Product>> => {
      if (!token || !profile || !hasPermission(profile, 'product.read')) {
        return { items: [], total: 0, skip: params.skip, take: params.take };
      }
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      query.set('isActive', 'true');
      if (params.search) query.set('search', params.search);
      const page = await apiRequest<ServerPage<Product>>(`/products?${query}`, { method: 'GET' }, token);
      // Featured first within the page, so a picker sees what is currently on
      // the rail without hunting through every other active product.
      return {
        ...page,
        items: [...page.items].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)),
      };
    },
    [token, profile],
  );

  const pager = useServerPager<Product>({
    fetchPage: fetchProductsPage,
    enabled: Boolean(token && profile),
  });

  async function toggleFeatured(product: Product) {
    if (!token || savingId) return;
    setSavingId(product.id);
    try {
      await apiRequest(
        `/products/${product.id}`,
        { method: 'PATCH', body: JSON.stringify({ isFeatured: !product.isFeatured }) },
        token,
      );
      setFeedback(
        product.isFeatured ? `${product.name} removed from Featured.` : `${product.name} is now Featured.`,
      );
      pager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSavingId(null);
    }
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || profileLoading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading featured products...</article>
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

  const canUpdate = hasPermission(profile, 'product.update');
  const featuredCount = pager.items.filter((product) => product.isFeatured).length;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="featuredProducts"
            pageTitle="Featured Products"
            pageSubtitle="Pick what leads the home page's Featured rail, the shop, and each product's own page. Anything left unpicked is filled in at random from what is in stock, so the rail is never empty."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className="portal-card">
              <div className="portal-card-head">
                <h2 style={{ margin: 0 }}>Products</h2>
                <span className="portal-muted">{featuredCount} featured on this page</span>
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={pager} placeholder="Search products…" />
              </div>

              {!pager.loading && pager.items.length === 0 ? (
                <div className="portal-empty-state">
                  {pager.search ? 'No products match.' : 'No active products yet.'}
                </div>
              ) : (
                <div className="portal-table-wrap">
                  <table className="portal-data-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Product</th>
                        <th>Category</th>
                        <th className="portal-num">Featured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pager.items.map((product) => (
                        <tr key={product.id} className={product.isFeatured ? 'is-featured' : undefined}>
                          <td>
                            <ListThumb
                              sources={[product.featuredImageUrl, product.imageUrls?.[0]]}
                              label={product.name}
                            />
                          </td>
                          <td>
                            {product.name}
                            {product.brand ? <span className="portal-muted"> · {product.brand}</span> : null}
                          </td>
                          <td>{product.category?.name || '—'}</td>
                          <td className="portal-num">
                            <label className="portal-switch" aria-label={`Feature ${product.name}`}>
                              <input
                                type="checkbox"
                                checked={product.isFeatured}
                                disabled={!canUpdate || savingId === product.id}
                                onChange={() => void toggleFeatured(product)}
                              />
                              <span className="portal-switch-track" aria-hidden="true" />
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ServerListPager pager={pager} noun="products" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
