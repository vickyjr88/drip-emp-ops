"use client";

/**
 * Blocks index: every block across every project, with a way into editing one.
 *
 * Blocks previously had no screen of their own -- they were created from a card
 * in Operations and listed nowhere you could act on them. Grouping by project
 * matches how people think about them ("Block A of Zenith", never "Block A").
 */

import Link from 'next/link';
import { useErrorState } from '../components/notifications';
import { ListExport } from '../components/list-export';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';
import { ListThumb } from '../components/list-thumb';

type ProjectBlock = {
  id: string;
  projectId: string;
  blockName: string;
  totalFloors: number;
  featuredImageUrl?: string | null;
  units?: Array<{ id: string; status?: string }>;
};

type Project = { id: string; code: string; name: string; featuredImageUrl?: string | null };

export function BlocksListClient() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [blocks, setBlocks] = useState<ProjectBlock[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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

      const [nextBlocks, nextProjects] = await Promise.all([
        hasPermission(nextProfile, 'project-block.read')
          ? apiRequest<ProjectBlock[]>('/project-block', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'project.read')
          ? apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setBlocks(nextBlocks);
      setProjects(nextProjects);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load blocks.');
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

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const rows = useMemo(
    () =>
      blocks
        .map((block) => {
          const project = projectById.get(block.projectId);
          return {
            ...block,
            projectCode: project?.code || '',
            projectName: project?.name || 'Unknown project',
            projectImage: project?.featuredImageUrl || null,
            unitCount: block.units?.length ?? 0,
          };
        })
        .sort(
          (a, b) =>
            a.projectCode.localeCompare(b.projectCode) || a.blockName.localeCompare(b.blockName),
        ),
    [blocks, projectById],
  );

  const controls = useListControls(rows, (row) => [
    row.blockName,
    row.projectCode,
    row.projectName,
  ]);

  const canCreate = hasPermission(profile, 'project-block.create');
  const canUpdate = hasPermission(profile, 'project-block.update');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading blocks...</article>
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
            active="blocks"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Project Blocks"
            pageSubtitle="Buildings and phases within each project. Units belong to a block."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            <article className="portal-card" data-tour="blocks.list">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Blocks</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    Grouped by project.
                  </p>
                </div>
                {canCreate ? (
                  <Link href="/portal/blocks/new" className="portal-primary-btn">
                    Add Block
                  </Link>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ListSearch controls={controls} placeholder="Search blocks or projects…" />
                <ListExport
                  rows={controls.filtered}
                  config={{
                    fileName: 'project-blocks',
                    columns: [
                      { header: 'Project Code', value: (row) => row.projectCode },
                      { header: 'Project', value: (row) => row.projectName },
                      { header: 'Block', value: (row) => row.blockName },
                      { header: 'Total Floors', value: (row) => row.totalFloors },
                      { header: 'Units', value: (row) => row.unitCount },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {controls.visible.length === 0 ? (
                  <div className="portal-empty-state">
                    {controls.search
                      ? 'No blocks match that search.'
                      : 'No blocks yet. Add one to start placing units.'}
                  </div>
                ) : (
                  controls.visible.map((row) => (
                    <div key={row.id} className="portal-record">
                      <div className="portal-list-row has-thumb">
                        <ListThumb
                          sources={[row.featuredImageUrl, row.projectImage]}
                          label={row.blockName}
                        />
                        <div>
                          <strong>
                            {row.projectCode ? `${row.projectCode} · ` : ''}Block {row.blockName}
                          </strong>
                          <p>
                            {row.projectName} — {row.totalFloors} floor
                            {row.totalFloors === 1 ? '' : 's'}, {row.unitCount} unit
                            {row.unitCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="portal-action-row">
                          {canUpdate ? (
                            <Link href={`/portal/blocks/${row.id}/edit`} className="portal-inline-btn">
                              Edit
                            </Link>
                          ) : null}
                          <Link
                            href={`/portal/units?blockId=${row.id}`}
                            className="portal-inline-btn"
                          >
                            View units
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ListPager controls={controls} noun="blocks" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
