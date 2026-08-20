"use client";

/**
 * Column reference for every CSV importer.
 *
 * The generic importers describe themselves: the backend already carries each
 * field's name, type, whether it is required and a hint, and the upload screen
 * validates against exactly that list. So this page renders those definitions
 * rather than restating them in prose -- documentation copied by hand goes
 * stale the first time a field is added, and a column reference that disagrees
 * with the validator is worse than none.
 *
 * Project expenses are not definition-driven, so it is described here
 * explicitly, because its rules live in its own screen and there is nowhere
 * else to read them.
 */

import Link from 'next/link';
import { useErrorState } from '../../components/notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../../accounting/lib';

type ImportField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
};

type Definition = {
  key: string;
  label: string;
  description: string;
  permissionSubject: string;
  uniqueBy?: string;
  fields: ImportField[];
};

/** Plain-English rendering of the validator's type names. */
const TYPE_NOTES: Record<string, string> = {
  string: 'Text',
  email: 'Email address',
  number: 'Whole number',
  decimal: 'Number, decimals allowed',
  decimalPercent: 'Percentage as a number',
  boolean: 'true or false',
  date: 'Date',
};

function typeLabel(type: string) {
  return TYPE_NOTES[type] || type;
}

const EXPENSE_COLUMNS: Array<{ name: string; required?: boolean; note: string }> = [
  { name: 'date', required: true, note: 'd/m/yyyy or yyyy-mm-dd. Slash dates are read day-first: 3/4/2024 is 3 April.' },
  { name: 'description', required: true, note: 'What the payment was for.' },
  { name: 'amount', required: true, note: 'Figure in KES.' },
  { name: 'accountCode', required: true, note: 'Expense category code. The downloaded template lists every valid code.' },
  { name: 'projectCode', note: 'Tags the expense to a project. The template lists the codes in use.' },
];

export function ImporterDocsClient() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
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
      setDefinitions(await apiRequest<Definition[]>('/data-imports', { method: 'GET' }, authToken));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the importer list.');
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

  const permissionFor = useCallback(
    (definition: Definition) =>
      `${definition.permissionSubject.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.create`,
    [],
  );

  // Everything is listed, including importers this operator cannot run: the
  // page answers "what does this column mean", and hiding a section would only
  // make the reference look incomplete. Whether they may run it is marked
  // instead, so the restriction is still visible.
  const canRun = useMemo(
    () => new Set(definitions.filter((d) => hasPermission(profile, permissionFor(d))).map((d) => d.key)),
    [definitions, profile, permissionFor],
  );

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading importer reference...</article>
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
            active="importers"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="CSV Column Reference"
            pageSubtitle="Every importer, its columns and what each one expects."
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
                  <h2 style={{ margin: 0 }}>Before you start</h2>
                </div>
                <Link href="/portal/importers" className="portal-inline-btn">
                  Back to Importers
                </Link>
              </div>
              <ul className="portal-doc-list">
                <li>
                  <strong>Download the template first.</strong> Each importer generates one with the
                  right header row already in place, which is easier than typing headers by hand.
                </li>
                <li>
                  <strong>Column order does not matter</strong>, but on the importers below the
                  header must match the column name exactly, including capitals. Starting from the
                  downloaded template avoids the problem entirely. The unit importer is more
                  forgiving and ignores case, spaces and underscores.
                </li>
                <li>
                  <strong>Every file is validated before anything is written.</strong> You see the
                  row-by-row result, and nothing is imported until you confirm.
                </li>
                <li>
                  <strong>Leave optional columns out entirely</strong> if you have no value for them.
                  An empty cell and a missing column are treated the same way.
                </li>
              </ul>
            </article>

            {/* Definition-driven importers, straight from the validator. */}
            {definitions.map((definition) => (
              <article key={definition.key} className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>{definition.label}</h2>
                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                      {definition.description}
                    </p>
                  </div>
                  {canRun.has(definition.key) ? (
                    <Link href="/portal/importers" className="portal-inline-btn">
                      Import
                    </Link>
                  ) : (
                    <span className="portal-muted">Your role cannot run this import</span>
                  )}
                </div>

                {definition.uniqueBy ? (
                  <p className="portal-muted">
                    <code>{definition.uniqueBy}</code> must be unique. A row whose{' '}
                    <code>{definition.uniqueBy}</code> already exists is rejected rather than
                    updating that record, and a value repeated within the file is rejected too. To
                    change an existing record, edit it directly instead of re-importing it.
                  </p>
                ) : null}

                <div className="portal-table-wrap">
                  <table className="portal-data-table is-doc">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Required</th>
                        <th>Expects</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {definition.fields.map((field) => (
                        <tr key={field.name}>
                          <td>
                            <code>{field.name}</code>
                          </td>
                          <td>{field.required ? 'Yes' : 'No'}</td>
                          <td>{typeLabel(field.type)}</td>
                          <td>{field.hint || (field.label !== field.name ? field.label : '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Project Expenses</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    Historical spend, tagged to a project and an expense category.
                  </p>
                </div>
                <Link href="/portal/accounting/import" className="portal-inline-btn">
                  Open
                </Link>
              </div>
              <p className="portal-muted">
                This template carries its instructions as <code>#</code> comment lines, along with
                every valid account and project code. Those lines are ignored on import, so they can
                be left in the file.
              </p>
              <div className="portal-table-wrap">
                <table className="portal-data-table is-doc">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Required</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXPENSE_COLUMNS.map((column) => (
                      <tr key={column.name}>
                        <td>
                          <code>{column.name}</code>
                        </td>
                        <td>{column.required ? 'Yes' : 'No'}</td>
                        <td>{column.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
