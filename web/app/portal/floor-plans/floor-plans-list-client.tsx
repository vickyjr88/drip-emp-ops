"use client";

/**
 * Floor plans index, grouped by project the way the blocks screen is: nobody
 * thinks about "Plan A" in isolation, only "Plan A at Zenith".
 */

import Link from 'next/link';
import { useErrorState } from '../components/notifications';
import { formatSqft, sqmToSqft } from '../../lib/area';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import { ListExport } from '../components/list-export';
import { ListThumb } from '../components/list-thumb';
import { usePortalDialog } from '../components/portal-dialog';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';

type FloorPlan = {
  id: string;
  projectId: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: string | number;
  priceKes?: string | number | null;
  description?: string | null;
  imageUrls?: string[] | null;
  featuredImageUrl?: string | null;
  displayOrder?: number | null;
  project?: { id: string; code: string; name: string; featuredImageUrl?: string | null };
  _count?: { units: number };
};

export function FloorPlansListClient() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [errorMessage, setErrorMessage] = useErrorState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      setPlans(
        hasPermission(nextProfile, 'floor-plan.read')
          ? await apiRequest<FloorPlan[]>('/floor-plans', { method: 'GET' }, authToken)
          : [],
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load floor plans.');
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

  // A project editor links here scoped to itself; without honouring that the
  // link would dump every project's plans and look broken.
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get('projectId') || '';

  const rows = useMemo(
    () =>
      plans
        .filter((plan) => !projectFilter || plan.projectId === projectFilter)
        .map((plan) => ({
        ...plan,
        projectCode: plan.project?.code || '',
        projectName: plan.project?.name || 'Unknown project',
        projectImage: plan.project?.featuredImageUrl || null,
        planImage:
          plan.featuredImageUrl ||
          (Array.isArray(plan.imageUrls) ? plan.imageUrls[0] : null) ||
          null,
        unitCount: plan._count?.units ?? 0,
      })),
    [plans, projectFilter],
  );

  const controls = useListControls(rows, (row) => [row.name, row.projectCode, row.projectName]);

  const canCreate = hasPermission(profile, 'floor-plan.create');
  const canUpdate = hasPermission(profile, 'floor-plan.update');
  const canDelete = hasPermission(profile, 'floor-plan.delete');

  async function onDelete(plan: { id: string; name: string; unitCount: number }) {
    if (!token || !canDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Floor Plan',
      // Units keep their copied figures, so name what is actually lost rather
      // than letting the unit count read as a threat.
      message:
        plan.unitCount > 0
          ? `${plan.unitCount} unit${plan.unitCount === 1 ? '' : 's'} reference ${plan.name}. They keep their own bedrooms, size and price; only the link and the drawing are lost. Continue?`
          : `Delete ${plan.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/floor-plans/${plan.id}`, { method: 'DELETE' }, token);
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the floor plan.');
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
            <article className="portal-card portal-loading">Loading floor plans...</article>
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
            active="floorPlans"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Floor Plans"
            pageSubtitle="Layouts offered in each development. Units created from a plan copy its figures."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Floor Plans</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    Grouped by project. A plan is a template — editing it never changes units already
                    created from it.
                  </p>
                </div>
                {canCreate ? (
                  <Link href="/portal/floor-plans/new" className="portal-primary-btn">
                    Add Floor Plan
                  </Link>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ListSearch controls={controls} placeholder="Search plans or projects…" />
                <ListExport
                  rows={controls.filtered}
                  config={{
                    fileName: 'floor-plans',
                    columns: [
                      { header: 'Project Code', value: (row) => row.projectCode },
                      { header: 'Project', value: (row) => row.projectName },
                      { header: 'Plan', value: (row) => row.name },
                      { header: 'Bedrooms', value: (row) => row.bedrooms },
                      { header: 'Bathrooms', value: (row) => row.bathrooms },
                      { header: 'Size (sq ft)', value: (row) => Math.round(sqmToSqft(row.sizeSqm)) },
                      { header: 'Indicative Price', value: (row) => (row.priceKes ? Number(row.priceKes) : '') },
                      { header: 'Units', value: (row) => row.unitCount },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {controls.visible.length === 0 ? (
                  <div className="portal-empty-state">
                    {controls.search
                      ? 'No plans match that search.'
                      : 'No floor plans yet. Add one so units can be created from it.'}
                  </div>
                ) : (
                  controls.visible.map((row) => (
                    <div key={row.id} className="portal-record">
                      <div className="portal-list-row has-thumb">
                        <ListThumb
                          sources={[row.planImage, row.projectImage]}
                          label={row.name}
                        />
                        <div>
                          <strong>
                            {row.projectCode ? `${row.projectCode} · ` : ''}
                            {row.name}
                          </strong>
                          <p>
                            {row.bedrooms === 0 ? 'Studio' : `${row.bedrooms} bed`}
                            {row.bathrooms ? ` · ${row.bathrooms} bath` : ''}
                            {` · ${formatSqft(row.sizeSqm)}`}
                            {row.priceKes ? ` · ${formatMoney(row.priceKes)}` : ''}
                          </p>
                          <p className="portal-muted">
                            {row.projectName} — {row.unitCount} unit
                            {row.unitCount === 1 ? '' : 's'} created from this plan
                          </p>
                        </div>
                        <div className="portal-action-row">
                          <Link href={`/portal/floor-plans/${row.id}`} className="portal-inline-btn">
                            View
                          </Link>
                          {canUpdate ? (
                            <Link href={`/portal/floor-plans/${row.id}/edit`} className="portal-inline-btn">
                              Edit
                            </Link>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() => void onDelete(row)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ListPager controls={controls} noun="floor plans" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
