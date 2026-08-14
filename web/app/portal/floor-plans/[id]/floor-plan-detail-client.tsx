"use client";

/**
 * Read-only view of a floor plan.
 *
 * Separate from the edit form because looking something up is the common case
 * and should not put an operator inside a form they might save by accident.
 * It also gives the units built from this plan somewhere to be listed, which
 * is the question the plan itself cannot answer.
 */

import Link from 'next/link';
import { useErrorState } from '../../components/notifications';
import { formatArea, formatSqft } from '../../../lib/area';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { ListThumb } from '../../components/list-thumb';
import { usePortalDialog } from '../../components/portal-dialog';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../../accounting/lib';

type PlanUnit = {
  id: string;
  unitNumber: string;
  status: string;
  bedrooms: number;
  sizeSqm: string | number;
  priceKes: string | number;
  featuredImageUrl?: string | null;
};

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

export function FloorPlanDetailClient({ planId }: { planId: string }) {
  const router = useRouter();
  const dialog = usePortalDialog();

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [units, setUnits] = useState<PlanUnit[]>([]);
  const [errorMessage, setErrorMessage] = useErrorState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const nextProfile = await loadProfile(authToken);
        setProfile(nextProfile);
        const nextPlan = await apiRequest<FloorPlan>(`/floor-plans/${planId}`, { method: 'GET' }, authToken);
        setPlan(nextPlan);

        // The units built from this plan. Filtered client-side because the unit
        // list has no floorPlanId filter, and a project's unit count is small
        // enough that fetching them is cheaper than adding one.
        if (hasPermission(nextProfile, 'unit.read') && nextPlan.projectId) {
          try {
            const response = await apiRequest<PlanUnit[] | { items: PlanUnit[] }>(
              `/units?projectId=${nextPlan.projectId}`,
              { method: 'GET' },
              authToken,
            );
            const all = Array.isArray(response) ? response : response.items || [];
            setUnits(all.filter((unit) => (unit as any).floorPlanId === planId));
          } catch {
            setUnits([]);
          }
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load the floor plan.');
      } finally {
        setLoading(false);
      }
    },
    [planId],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canUpdate = hasPermission(profile, 'floor-plan.update');
  const canDelete = hasPermission(profile, 'floor-plan.delete');
  const unitCount = plan?._count?.units ?? units.length;

  async function onDelete() {
    if (!token || !canDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Floor Plan',
      // Units keep their copied figures, so this is less destructive than the
      // count makes it look. Say so rather than leaving it to be guessed at.
      message:
        unitCount > 0
          ? `${unitCount} unit${unitCount === 1 ? '' : 's'} reference this plan. They keep their own bedrooms, size and price; only the link and the drawing are lost. Continue?`
          : 'Delete this floor plan? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiRequest(`/floor-plans/${planId}`, { method: 'DELETE' }, token);
      router.push('/portal/floor-plans');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the floor plan.');
      setDeleting(false);
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
            <article className="portal-card portal-loading">Loading floor plan...</article>
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

  const images = Array.isArray(plan?.imageUrls) ? plan!.imageUrls! : [];

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="floorPlans"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle={plan?.name || 'Floor Plan'}
            pageSubtitle={
              plan?.project ? `${plan.project.code} · ${plan.project.name}` : 'Floor plan details'
            }
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            {!plan ? (
              <article className="portal-card">
                <div className="portal-empty-state">This floor plan no longer exists.</div>
                <Link href="/portal/floor-plans" className="portal-inline-btn">
                  Back to Floor Plans
                </Link>
              </article>
            ) : (
              <>
                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <div>
                      <h2 style={{ margin: 0 }}>{plan.name}</h2>
                      <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                        {plan.bedrooms === 0 ? 'Studio' : `${plan.bedrooms} bed`}
                        {plan.bathrooms ? ` · ${plan.bathrooms} bath` : ''}
                        {` · ${formatSqft(plan.sizeSqm)}`}
                        {plan.priceKes ? ` · ${formatMoney(plan.priceKes)} indicative` : ''}
                      </p>
                    </div>
                    <div className="portal-action-row">
                      <Link href="/portal/floor-plans" className="portal-inline-btn">
                        Back
                      </Link>
                      {canUpdate ? (
                        <Link href={`/portal/floor-plans/${plan.id}/edit`} className="portal-inline-btn">
                          Edit
                        </Link>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="portal-inline-btn is-danger"
                          onClick={() => void onDelete()}
                          disabled={deleting}
                        >
                          {deleting ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <dl className="portal-detail-grid">
                    <div>
                      <dt>Project</dt>
                      <dd>
                        {plan.project ? (
                          <Link href={`/portal/projects/${plan.projectId}/edit`}>
                            {plan.project.code} · {plan.project.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Bedrooms</dt>
                      <dd>{plan.bedrooms === 0 ? 'Studio' : plan.bedrooms}</dd>
                    </div>
                    <div>
                      <dt>Bathrooms</dt>
                      <dd>{plan.bathrooms || '—'}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{formatArea(plan.sizeSqm)}</dd>
                    </div>
                    <div>
                      <dt>Indicative price</dt>
                      <dd>{plan.priceKes ? formatMoney(plan.priceKes) : '—'}</dd>
                    </div>
                    <div>
                      <dt>Units from this plan</dt>
                      <dd>{unitCount}</dd>
                    </div>
                  </dl>

                  {plan.description ? (
                    <p style={{ marginTop: 12 }}>{plan.description}</p>
                  ) : null}
                </article>

                <article className="portal-card">
                  <h2 style={{ margin: 0 }}>Drawings</h2>
                  {images.length === 0 ? (
                    <div className="portal-empty-state" style={{ marginTop: 12 }}>
                      No drawing uploaded for this plan.
                    </div>
                  ) : (
                    <div className="portal-project-gallery-grid" style={{ marginTop: 12 }}>
                      {images.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className={`portal-project-gallery-item${plan.featuredImageUrl === url ? ' is-featured' : ''}`}
                        >
                          <a href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt={`${plan.name} drawing ${index + 1}`}
                              className="portal-project-gallery-thumb"
                            />
                          </a>
                          {plan.featuredImageUrl === url ? (
                            <div className="portal-gallery-item-actions">
                              <span className="portal-featured-badge">Thumbnail</span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                {hasPermission(profile, 'unit.read') ? (
                  <article className="portal-card">
                    <h2 style={{ margin: 0 }}>Units Built To This Plan</h2>
                    <p className="portal-muted" style={{ margin: '4px 0 12px' }}>
                      Each copied its figures when it was created, so these may differ from the
                      plan above.
                    </p>
                    <div className="portal-list-stack">
                      {units.length === 0 ? (
                        <div className="portal-empty-state">No units reference this plan yet.</div>
                      ) : (
                        units.map((unit) => (
                          <div key={unit.id} className="portal-record">
                            <div className="portal-list-row has-thumb">
                              <ListThumb
                                sources={[
                                  unit.featuredImageUrl,
                                  plan.featuredImageUrl,
                                  images[0],
                                  plan.project?.featuredImageUrl,
                                ]}
                                label={unit.unitNumber}
                              />
                              <div>
                                <strong>{unit.unitNumber}</strong>
                                <p>
                                  {unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms} bed`}
                                  {` · ${formatSqft(unit.sizeSqm)}`}
                                  {` · ${formatMoney(unit.priceKes)}`}
                                </p>
                              </div>
                              <span>{unit.status}</span>
                              <div className="portal-action-row">
                                <Link href={`/portal/units/${unit.id}/edit`} className="portal-inline-btn">
                                  Open
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ) : null}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
