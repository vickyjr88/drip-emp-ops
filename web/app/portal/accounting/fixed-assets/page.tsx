"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { ListExport } from '../../components/list-export';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../../components/server-pager';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { usePortalDialog } from '../../components/portal-dialog';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../lib';

type Store = { id: string; code: string; name: string };

type FixedAsset = {
  id: string;
  assetCode: string;
  description: string;
  category: string;
  storeId?: string | null;
  acquisitionDate: string;
  acquisitionCost: string | number;
  usefulLifeMonths: number;
  residualValue: string | number;
  status: 'ACTIVE' | 'DISPOSED' | 'TRANSFERRED';
};

export default function FixedAssetsPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [exportRows, setExportRows] = useState<FixedAsset[]>([]);

  const [showAssetForm, setShowAssetForm] = useState(false);
  const [assetCode, setAssetCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [storeId, setStoreId] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('60');
  const [residualValue, setResidualValue] = useState('0');

  const [depreciationPeriod, setDepreciationPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      const nextStores = hasPermission(nextProfile, 'store.read')
        ? await apiRequest<Store[]>('/stores', { method: 'GET' }, authToken)
        : [];
      setProfile(nextProfile);
      setStores(nextStores);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load fixed assets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const fetchAssetsPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<FixedAsset>> => {
      if (!token || !profile || !hasPermission(profile, 'fixed-asset.read')) {
        return { items: [], total: 0, skip: params.skip, take: params.take };
      }
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<FixedAsset>>(`/fixed-assets?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const assetsPager = useServerPager<FixedAsset>({
    fetchPage: (params) => fetchAssetsPage(params),
    enabled: Boolean(token && profile),
  });

  useEffect(() => {
    if (!token || !profile || !hasPermission(profile, 'fixed-asset.read')) return;
    const timer = setTimeout(() => {
      void fetchAssetsPage({ skip: 0, take: 500, search: assetsPager.search }).then((page) => setExportRows(page.items));
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchAssetsPage, assetsPager.search, token, profile]);

  const storeMap = useMemo(() => {
    const map = new Map<string, Store>();
    for (const store of stores) map.set(store.id, store);
    return map;
  }, [stores]);

  const canCreateAsset = hasPermission(profile, 'fixed-asset.create');
  const canUpdateAsset = hasPermission(profile, 'fixed-asset.update');
  const canCreateTransfer = hasPermission(profile, 'asset-transfer.create');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    if (!token) return;
    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      await action();
      setFeedback(successMessage);
      assetsPager.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setMutating(false);
    }
  }

  async function onCreateAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateAsset) return;
    await runMutation(async () => {
      await apiRequest(
        '/fixed-assets',
        {
          method: 'POST',
          body: JSON.stringify({
            assetCode,
            description,
            category,
            storeId: storeId || undefined,
            acquisitionDate,
            acquisitionCost: Number(acquisitionCost),
            usefulLifeMonths: Number(usefulLifeMonths),
            residualValue: Number(residualValue || 0),
          }),
        },
        token,
      );
      setShowAssetForm(false);
      setAssetCode('');
      setDescription('');
      setCategory('');
      setStoreId('');
      setAcquisitionDate('');
      setAcquisitionCost('');
    }, 'Fixed asset created.');
  }

  async function onRunDepreciation() {
    if (!token || !canUpdateAsset) return;
    await runMutation(async () => {
      const result = await apiRequest<{ postedCount: number }>(
        '/fixed-assets/run-depreciation',
        { method: 'POST', body: JSON.stringify({ periodStart: `${depreciationPeriod}-01` }) },
        token,
      );
      setFeedback(`Posted depreciation for ${result.postedCount} asset(s).`);
    }, 'Depreciation run complete.');
  }

  async function onDispose(id: string) {
    if (!token || !canUpdateAsset) return;
    const result = await dialog.prompt({
      title: 'Dispose Asset',
      fields: [
        { name: 'proceeds', label: 'Disposal Proceeds', type: 'number', defaultValue: '0', placeholder: 'Leave blank for 0' },
      ],
      confirmLabel: 'Dispose',
    });
    if (!result) return;
    const proceedsStr = result.proceeds;
    await runMutation(async () => {
      await apiRequest(`/fixed-assets/${id}/dispose`, { method: 'POST', body: JSON.stringify({ disposalProceeds: Number(proceedsStr || 0) }) }, token);
    }, 'Asset disposed.');
  }

  async function onTransfer(assetId: string) {
    if (!token || !canCreateTransfer) return;
    // toProjectId is the API's field name, and the AssetTransfer table still
    // spells its columns that way; the value is a store id and the service
    // writes it to the asset's storeId. Renaming the wire field would need a
    // migration, so only the screen's own wording changed.
    const toProjectId = transferTargets[assetId];
    if (!toProjectId) return;
    await runMutation(async () => {
      await apiRequest(
        '/asset-transfers',
        { method: 'POST', body: JSON.stringify({ assetId, toProjectId, transferredBy: profile?.email }) },
        token,
      );
    }, 'Asset transferred.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading fixed assets...</article>
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

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="accounting"
            pageTitle="Fixed Assets"
            pageSubtitle="Asset register, automatic depreciation, and transfers between stores."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/accounting" className="portal-ghost-btn">
                Back to Accounting
              </Link>
            </div>


            {canUpdateAsset ? (
              <article className="portal-card" data-tour="assets.depreciation">
                <h2>Run Monthly Depreciation</h2>
                <p className="portal-muted">
                  Posts one month of straight-line depreciation for every active asset not yet covered for the selected period. Safe to
                  re-run — already-posted assets are skipped.
                </p>
                <div className="portal-entity-form">
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Period</span>
                      <input type="month" value={depreciationPeriod} onChange={(event) => setDepreciationPeriod(event.target.value)} />
                    </label>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button type="button" className="portal-primary-btn" disabled={mutating} onClick={() => void onRunDepreciation()}>
                        {mutating ? 'Running...' : 'Run Depreciation'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            <article className="portal-card" data-tour="assets.register">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Asset Register</h2>
                {canCreateAsset ? (
                  <button type="button" className="portal-inline-btn" onClick={() => setShowAssetForm((prev) => !prev)}>
                    {showAssetForm ? 'Close' : 'New Asset'}
                  </button>
                ) : null}
              </div>

              {showAssetForm && canCreateAsset ? (
                <form className="portal-entity-form portal-detail-form" onSubmit={onCreateAsset}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Asset Code</span>
                      <input value={assetCode} onChange={(event) => setAssetCode(event.target.value)} required />
                    </label>
                    <label>
                      <span>Category</span>
                      <input value={category} onChange={(event) => setCategory(event.target.value)} required />
                    </label>
                  </div>
                  <label>
                    <span>Description</span>
                    <input value={description} onChange={(event) => setDescription(event.target.value)} required />
                  </label>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Store (optional)</span>
                      <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                        <option value="">Unassigned</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.code} — {store.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Acquisition Date</span>
                      <input type="date" value={acquisitionDate} onChange={(event) => setAcquisitionDate(event.target.value)} required />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Acquisition Cost</span>
                      <input type="number" min={0.01} step="0.01" value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} required />
                    </label>
                    <label>
                      <span>Useful Life (months)</span>
                      <input type="number" min={1} value={usefulLifeMonths} onChange={(event) => setUsefulLifeMonths(event.target.value)} required />
                    </label>
                    <label>
                      <span>Residual Value</span>
                      <input type="number" min={0} step="0.01" value={residualValue} onChange={(event) => setResidualValue(event.target.value)} />
                    </label>
                  </div>
                  <button type="submit" className="portal-primary-btn" disabled={mutating}>
                    {mutating ? 'Saving...' : 'Create Asset'}
                  </button>
                </form>
              ) : null}

              <div className="list-toolbar">
                <ServerListSearch pager={assetsPager} placeholder="Search assets…" />
                  <ListExport
                    rows={exportRows}
                    config={{
                      fileName: 'fixed-assets',
                      dateOf: (row) => row.acquisitionDate,
                      dateLabel: 'Acquired',
                      columns: [
                        { header: 'Asset Code', value: (row) => row.assetCode },
                        { header: 'Description', value: (row) => row.description },
                        { header: 'Category', value: (row) => row.category },
                        { header: 'Acquisition Cost', value: (row) => Number(row.acquisitionCost) },
                        { header: 'Useful Life (months)', value: (row) => row.usefulLifeMonths },
                        { header: 'Residual Value', value: (row) => Number(row.residualValue) },
                        { header: 'Status', value: (row) => row.status },
                        { header: 'Acquired', value: (row) => formatDate(row.acquisitionDate) },
                      ],
                    }}
                  />
              </div>
              <div className="portal-list-stack">
                {!assetsPager.loading && assetsPager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {assetsPager.search ? 'No assets match.' : 'No fixed assets registered yet.'}
                  </div>
                ) : (
                  assetsPager.items.map((asset) => (
                    <div key={asset.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {asset.assetCode} — {asset.description}
                          </strong>
                          <p>
                            {asset.category} • Acquired {formatDate(asset.acquisitionDate)}
                            {asset.storeId ? ` • ${storeMap.get(asset.storeId)?.name || 'Unknown store'}` : ' • Unassigned'}
                          </p>
                        </div>
                        <span>{asset.status}</span>
                        <span>{formatMoney(asset.acquisitionCost)}</span>
                      </div>

                      {asset.status === 'ACTIVE' ? (
                        <div className="portal-action-row" style={{ alignItems: 'center' }}>
                          {canCreateTransfer ? (
                            <>
                              <select
                                className="portal-inline-select"
                                value={transferTargets[asset.id] || ''}
                                onChange={(event) => setTransferTargets((prev) => ({ ...prev, [asset.id]: event.target.value }))}
                                style={{ minWidth: 200 }}
                              >
                                <option value="">Transfer to store...</option>
                                {stores
                                  .filter((store) => store.id !== asset.storeId)
                                  .map((store) => (
                                    <option key={store.id} value={store.id}>
                                      {store.code} — {store.name}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                className="portal-inline-btn"
                                disabled={!transferTargets[asset.id]}
                                onClick={() => void onTransfer(asset.id)}
                              >
                                Transfer
                              </button>
                            </>
                          ) : null}
                          {canUpdateAsset ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDispose(asset.id)}>
                              Dispose
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={assetsPager} noun="assets" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
