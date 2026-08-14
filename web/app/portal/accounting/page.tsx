"use client";

import Link from 'next/link';
import { useErrorState } from '../components/notifications';
import { TourLauncher } from '../tours/tour-launcher';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from './lib';

type TrialBalance = { totalDebit: number; totalCredit: number; rows: unknown[] };
type Aging = { buckets: Record<string, number>; rows: unknown[] };

type ModuleLink = {
  href: string;
  title: string;
  description: string;
  permission: string;
};

const MODULES: ModuleLink[] = [
  {
    href: '/portal/accounting/receivable',
    title: 'Accounts Receivable',
    description: 'Invoices, receipts, partial payments, refunds, aging & customer statements.',
    permission: 'invoice.read',
  },
  {
    href: '/portal/accounting/payable',
    title: 'Accounts Payable',
    description: 'Suppliers, supplier invoices, staged payments, statement reconciliation.',
    permission: 'supplier.read',
  },
  {
    href: '/portal/accounting/petty-cash',
    title: 'Petty Cash',
    description: 'Cash boxes, top-up/expense vouchers, reconciliations.',
    permission: 'petty-cash-box.read',
  },
  {
    href: '/portal/accounting/import',
    title: 'Import Project Expenses',
    description: 'Bulk-load historical spend from a spreadsheet, with a template and per-batch undo.',
    permission: 'journal-entry.create',
  },
  {
    href: '/portal/accounting/ledger',
    title: 'General Ledger',
    description: 'Chart of accounts, manual & reversing journals, bank accounts & reconciliation.',
    permission: 'journal-entry.read',
  },
  {
    href: '/portal/accounting/fixed-assets',
    title: 'Fixed Assets',
    description: 'Asset register, automatic depreciation, transfers between projects.',
    permission: 'fixed-asset.read',
  },
  {
    href: '/portal/accounting/reports',
    title: 'Financial Reports',
    description: 'Trial Balance, P&L, Balance Sheet, Cash Flow, AR/AP Aging, Project Profitability, Tax.',
    permission: 'journal-entry.read',
  },
  {
    href: '/portal/accounting/tax',
    title: 'Taxes & Duties',
    description: 'VAT and withholding tax rates, and remittances to KRA.',
    permission: 'tax-rate.read',
  },
];

export default function AccountingHubPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [arAging, setArAging] = useState<Aging | null>(null);
  const [apAging, setApAging] = useState<Aging | null>(null);

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

      const [tb, ar, ap] = await Promise.all([
        hasPermission(nextProfile, 'journal-entry.read')
          ? apiRequest<TrialBalance>('/reports/trial-balance', { method: 'GET' }, authToken)
          : Promise.resolve(null),
        hasPermission(nextProfile, 'invoice.read')
          ? apiRequest<Aging>('/invoices/reports/aging', { method: 'GET' }, authToken)
          : Promise.resolve(null),
        hasPermission(nextProfile, 'journal-entry.read')
          ? apiRequest<Aging>('/reports/ap-aging', { method: 'GET' }, authToken)
          : Promise.resolve(null),
      ]);
      setTrialBalance(tb);
      setArAging(ar);
      setApAging(ap);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load accounting overview.');
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

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading accounting overview...</article>
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

  const arOutstanding = (arAging?.rows as any[] | undefined)?.reduce((sum, row) => sum + Number(row.balance || 0), 0) || 0;
  const apOutstanding = (apAging?.rows as any[] | undefined)?.reduce((sum, row) => sum + Number(row.balance || 0), 0) || 0;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="accounting"
            pageTitle="Accounting"
            pageSubtitle="General ledger, receivables, payables, petty cash, fixed assets, and financial reporting."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >

            {trialBalance || arAging || apAging ? (
              <div className="portal-detail-grid" style={{ marginBottom: 20 }}>
                {trialBalance ? (
                  <article className="portal-card" data-tour="accounting.trial-balance">
                    <h2>Trial Balance</h2><TourLauncher tour="accounting-basics" />
                    <div className="portal-detail-stats">
                      <div>
                        <span>Total Debits</span>
                        <strong>{formatMoney(trialBalance.totalDebit)}</strong>
                      </div>
                      <div>
                        <span>Total Credits</span>
                        <strong>{formatMoney(trialBalance.totalCredit)}</strong>
                      </div>
                      <div>
                        <span>Balanced</span>
                        <strong>
                          {Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.01 ? 'Yes' : 'No'}
                        </strong>
                      </div>
                    </div>
                  </article>
                ) : null}
                {arAging ? (
                  <article className="portal-card" data-tour="accounting.ar-summary">
                    <h2>Accounts Receivable</h2>
                    <div className="portal-detail-stats">
                      <div>
                        <span>Outstanding</span>
                        <strong>{formatMoney(arOutstanding)}</strong>
                      </div>
                      <div>
                        <span>Open Invoices</span>
                        <strong>{arAging.rows.length}</strong>
                      </div>
                    </div>
                  </article>
                ) : null}
                {apAging ? (
                  <article className="portal-card" data-tour="accounting.ap-summary">
                    <h2>Accounts Payable</h2>
                    <div className="portal-detail-stats">
                      <div>
                        <span>Outstanding</span>
                        <strong>{formatMoney(apOutstanding)}</strong>
                      </div>
                      <div>
                        <span>Open Invoices</span>
                        <strong>{apAging.rows.length}</strong>
                      </div>
                    </div>
                  </article>
                ) : null}
              </div>
            ) : null}

            <div className="portal-section-grid">
              {MODULES.filter((module) => hasPermission(profile, module.permission)).map((module) => (
                <article key={module.href} className="portal-card">
                  <h2 style={{ margin: '0 0 8px' }}>{module.title}</h2>
                  <p className="portal-muted" style={{ margin: '0 0 16px' }}>
                    {module.description}
                  </p>
                  <Link href={module.href} className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                    Open
                  </Link>
                </article>
              ))}
            </div>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
