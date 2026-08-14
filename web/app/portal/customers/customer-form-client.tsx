"use client";

/**
 * Add or edit a customer.
 *
 * Cut down to what a shoe shop actually holds: a name, an email, a phone
 * number, and whether they can sign in to see their orders. The ID number,
 * KRA PIN and next-of-kin contacts this used to collect belonged to property
 * contracts, and the model no longer carries them.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  portalEnabled: boolean;
};

const BLANK = { firstName: '', lastName: '', email: '', phone: '' };

export default function CustomerFormClient({
  mode,
  customerId,
}: {
  mode: 'create' | 'edit';
  customerId?: string;
}) {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [form, setForm] = useState(BLANK);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      setProfile(await loadProfile(authToken));
      if (mode === 'edit' && customerId) {
        const customer = await apiRequest<Customer>(`/customers/${customerId}`, { method: 'GET' }, authToken);
        setForm({
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: customer.email || '',
          phone: customer.phone || '',
        });
        setPortalEnabled(customer.portalEnabled);
      }
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [mode, customerId, setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const body = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
      };
      if (mode === 'edit' && customerId) {
        await apiRequest(`/customers/${customerId}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
        setFeedback(`${body.firstName} updated.`);
      } else {
        await apiRequest('/customers', { method: 'POST', body: JSON.stringify(body) }, token);
        setFeedback(`${body.firstName} added.`);
      }
      router.push('/portal/customers');
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading…</article>
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

  const canWrite = hasPermission(profile, mode === 'edit' ? 'customer.update' : 'customer.create');

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="customers"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle={mode === 'edit' ? 'Edit Customer' : 'Add Customer'}
            pageSubtitle="Name, contact details, and whether they can sign in to see their orders."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className="portal-card">
              <form className="portal-entity-form" onSubmit={onSubmit}>
                <div className="portal-entity-grid-2">
                  <label>
                    <span>First name</span>
                    <input
                      value={form.firstName}
                      required
                      disabled={!canWrite}
                      onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Last name</span>
                    <input
                      value={form.lastName}
                      required
                      disabled={!canWrite}
                      onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="portal-entity-grid-2">
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={form.email}
                      required
                      disabled={!canWrite}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      value={form.phone}
                      placeholder="+254…"
                      required
                      disabled={!canWrite}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    />
                  </label>
                </div>

                {mode === 'edit' ? (
                  <p className="portal-muted">
                    {portalEnabled
                      ? 'This customer can sign in to see their orders.'
                      : 'No sign-in yet. They get one by setting a password when they check out.'}
                  </p>
                ) : null}

                <div className="portal-inline-actions">
                  <button type="submit" className="portal-primary-btn" disabled={saving || !canWrite}>
                    {saving ? 'Saving…' : mode === 'edit' ? 'Save Customer' : 'Add Customer'}
                  </button>
                  <Link href="/portal/customers" className="portal-ghost-btn">Cancel</Link>
                </div>
              </form>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
