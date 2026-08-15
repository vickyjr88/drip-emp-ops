"use client";

/**
 * Customers.
 *
 * Replaces a placeholder that said the list "is not built yet", which left the
 * admin with no way to see or reach a customer at all -- the detail and edit
 * screens existed but nothing linked to them.
 *
 * A shoe shop's customer record is thin by design: most sales are walk-ins who
 * never become one. The rows lead with how to reach someone, because that is
 * what the record is actually for, and whether they can sign in to track an
 * order.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import { ListExport } from '../components/list-export';
import { useErrorState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  portalEnabled: boolean;
  portalLastLoginAt?: string | null;
  createdAt: string;
};

export default function CustomersPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [errorMessage, setErrorMessage] = useErrorState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      if (hasPermission(nextProfile, 'customer.read')) {
        setCustomers(await apiRequest<Customer[]>('/customers', { method: 'GET' }, authToken));
      }
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
    // setErrorMessage is stable from the notifications provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const controls = useListControls(customers, (row) => [
    row.firstName, row.lastName, row.email, row.phone || '',
  ]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading customers...</article>
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

  const canCreate = hasPermission(profile, 'customer.create');

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="customers"
            pageTitle="Customers"
            pageSubtitle="People who have bought from us or signed up to track an order."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className="portal-card">
              <div className="portal-card-head">
                <h2 style={{ margin: 0 }}>All Customers</h2>
                {canCreate ? (
                  <Link href="/portal/customers/new" className="portal-primary-btn">
                    Add Customer
                  </Link>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ListSearch controls={controls} placeholder="Search name, email, phone…" />
                <ListExport
                  rows={controls.filtered}
                  config={{
                    fileName: 'customers',
                    columns: [
                      { header: 'First Name', value: (row) => row.firstName },
                      { header: 'Last Name', value: (row) => row.lastName },
                      { header: 'Email', value: (row) => row.email },
                      { header: 'Phone', value: (row) => row.phone || '' },
                      { header: 'Account', value: (row) => (row.portalEnabled ? 'Yes' : 'No') },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {controls.visible.length === 0 ? (
                  <div className="portal-empty-state">
                    {controls.search
                      ? 'No customers match.'
                      : 'No customers yet. Walk-in sales do not create one — a record appears when someone checks out online or is added here.'}
                  </div>
                ) : (
                  controls.visible.map((customer) => (
                    <div key={customer.id} className="portal-list-row">
                      <div>
                        <strong>
                          <Link href={`/portal/customers/${customer.id}`}>
                            {customer.firstName} {customer.lastName}
                          </Link>
                        </strong>
                        <p className="portal-muted" style={{ margin: '2px 0 0' }}>
                          {customer.email}
                          {customer.phone ? ` · ${customer.phone}` : ''}
                        </p>
                      </div>
                      <div className="portal-list-meta">
                        <span>
                          {/* Whether they can sign in matters more than when they
                              were added: it decides if they can chase their own
                              order or have to phone the shop. */}
                          {customer.portalEnabled ? 'Has an account' : 'No account'}
                        </span>
                        <span className="portal-muted">Added {formatDate(customer.createdAt)}</span>
                      </div>
                      <Link href={`/portal/customers/${customer.id}`} className="portal-inline-btn">
                        Open
                      </Link>
                    </div>
                  ))
                )}
              </div>
              <ListPager controls={controls} noun="customers" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
