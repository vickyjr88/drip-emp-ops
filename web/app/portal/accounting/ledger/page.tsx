"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { TourLauncher } from '../../tours/tour-launcher';
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

type ChartOfAccount = { id: string; code: string; name: string; type: string; subtype?: string | null; isSystem: boolean };

type JournalLine = {
  id: string;
  accountId: string;
  account: ChartOfAccount;
  debit: string | number;
  credit: string | number;
  memo?: string | null;
  storeId?: string | null;
};

type JournalEntry = {
  id: string;
  entryNumber: string;
  entryDate: string;
  memo?: string | null;
  source: string;
  status: 'POSTED' | 'REVERSED';
  postedBy: string;
  lines: JournalLine[];
};

type BankAccount = {
  id: string;
  type: 'BANK' | 'MOBILE_MONEY';
  name: string;
  bankName: string;
  accountNumber: string;
  branch?: string | null;
  currencyCode: string;
  glAccountId: string;
  storeId?: string | null;
  isActive: boolean;
};

type Store = { id: string; code: string; name: string };

type AccountTransfer = {
  id: string;
  transferNumber: string;
  fromAccount: BankAccount;
  toAccount: BankAccount;
  amount: string | number;
  currency: string;
  transferDate: string;
  memo?: string | null;
};

const ACCOUNT_PURPOSES = ['SALES', 'RENT', 'UTILITIES', 'SUPPLIER_PAYMENTS', 'TAX_REMITTANCE', 'GENERAL'] as const;
type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

type StoreAccountAssignment = {
  id: string;
  storeId: string;
  purpose: AccountPurpose;
  bankAccountId: string;
  bankAccount: BankAccount;
};

type LedgerTab = 'chart' | 'journals' | 'banks' | 'transfers' | 'assignments';

type JournalPage = { items: JournalEntry[]; total: number; skip: number; take: number };

type JournalFilters = {
  search: string;
  storeId: string;
  accountId: string;
  source: string;
  status: string;
  from: string;
  to: string;
  minAmount: string;
  untaggedOnly: boolean;
};

const JOURNAL_PAGE_SIZE = 50;

const JOURNAL_SOURCES = [
  'MANUAL',
  'AR',
  'AP',
  'PETTY_CASH',
  'DEPRECIATION',
  'BANK_RECON',
  'ASSET_TRANSFER',
  'ACCOUNT_TRANSFER',
  'TAX_REMITTANCE',
] as const;

function journalQuery(filters: JournalFilters, skip: number) {
  const params = new URLSearchParams();
  params.set('take', String(JOURNAL_PAGE_SIZE));
  params.set('skip', String(skip));
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.storeId) params.set('storeId', filters.storeId);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.source) params.set('source', filters.source);
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.minAmount) params.set('minAmount', filters.minAmount);
  if (filters.untaggedOnly) params.set('untaggedOnly', 'true');
  return params.toString();
}

type ManualJournalLineForm = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
  // Per line, not per entry: one payment can be split across stores, and an
  // untagged line never reaches a store cost report.
  storeId: string;
};

type BankAccountForm = {
  type: 'BANK' | 'MOBILE_MONEY';
  name: string;
  bankName: string;
  accountNumber: string;
  branch: string;
  glAccountId: string;
  storeId: string;
  isActive: boolean;
};

function makeBankAccountForm(bank?: BankAccount | null): BankAccountForm {
  return {
    type: bank?.type || 'BANK',
    name: bank?.name || '',
    bankName: bank?.bankName || '',
    accountNumber: bank?.accountNumber || '',
    branch: bank?.branch || '',
    glAccountId: bank?.glAccountId || '',
    storeId: bank?.storeId || '',
    isActive: bank?.isActive ?? true,
  };
}

const PURPOSE_LABELS: Record<AccountPurpose, string> = {
  SALES: 'Unit Sales Collections',
  RENT: 'Rent Collections',
  UTILITIES: 'Utilities Collections',
  SUPPLIER_PAYMENTS: 'Supplier Payments',
  TAX_REMITTANCE: 'Tax Remittance',
  GENERAL: 'General / Fallback',
};

export default function GeneralLedgerPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<LedgerTab>('journals');

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankBalances, setBankBalances] = useState<Record<string, number>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [assignmentsByStore, setAssignmentsByStore] = useState<Record<string, StoreAccountAssignment[]>>({});
  const [assignmentStoreId, setAssignmentStoreId] = useState('');

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountCode, setAccountCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('ASSET');

  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalMemo, setJournalMemo] = useState('');
  const [journalLines, setJournalLines] = useState<ManualJournalLineForm[]>([
    { accountId: '', debit: '', credit: '', memo: '', storeId: '' },
    { accountId: '', debit: '', credit: '', memo: '', storeId: '' },
  ]);
  const [journalDate, setJournalDate] = useState('');
  // Kept between postings: entering a store's spend line by line means the
  // same store and date repeat for dozens of consecutive entries.
  const [journalDefaultStoreId, setJournalDefaultStoreId] = useState('');

  const [journalTotal, setJournalTotal] = useState(0);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [journalSkip, setJournalSkip] = useState(0);
  const [filters, setFilters] = useState({
    search: '',
    storeId: '',
    accountId: '',
    source: '',
    status: '',
    from: '',
    to: '',
    minAmount: '',
    untaggedOnly: false,
  });
  // Applied separately from the inputs so typing does not refetch on every key.
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [recategoriseEntryId, setRecategoriseEntryId] = useState<string | null>(null);
  const [recategoriseLines, setRecategoriseLines] = useState<
    Array<{ lineId: string; accountId: string; storeId: string; amountLabel: string }>
  >([]);

  const [showBankForm, setShowBankForm] = useState(false);
  const [bankForm, setBankForm] = useState<BankAccountForm>(makeBankAccountForm());
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankEditForm, setBankEditForm] = useState<BankAccountForm>(makeBankAccountForm());

  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', memo: '' });

  const [assignmentForm, setAssignmentForm] = useState<{ purpose: AccountPurpose; bankAccountId: string }>({
    purpose: 'SALES',
    bankAccountId: '',
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, [appliedFilters, journalSkip]);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      const [nextAccounts, nextJournals, nextBanks, nextStores] = await Promise.all([
        hasPermission(nextProfile, 'chart-of-account.read')
          ? apiRequest<ChartOfAccount[]>('/chart-of-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'journal-entry.read')
          ? apiRequest<JournalPage>(`/journal-entries?${journalQuery(appliedFilters, journalSkip)}`, { method: 'GET' }, authToken)
          : Promise.resolve({ items: [], total: 0, skip: 0, take: JOURNAL_PAGE_SIZE }),
        hasPermission(nextProfile, 'bank-account.read')
          ? apiRequest<BankAccount[]>('/bank-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'store.read')
          ? apiRequest<Store[]>('/stores', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setAccounts(nextAccounts);
      setJournals(nextJournals.items);
      setJournalTotal(nextJournals.total);
      setBankAccounts(nextBanks);
      setStores(nextStores);

      if (hasPermission(nextProfile, 'bank-account.read')) {
        const balanceEntries = await Promise.all(
          nextBanks.map((bank) =>
            apiRequest<{ balance: number }>(`/bank-accounts/${bank.id}/balance`, { method: 'GET' }, authToken).then(
              (result) => [bank.id, result.balance] as const,
            ),
          ),
        );
        setBankBalances(Object.fromEntries(balanceEntries));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load general ledger.');
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

  const fetchTransfersPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<AccountTransfer>> => {
      if (!token || !profile || !hasPermission(profile, 'account-transfer.read')) {
        return { items: [], total: 0, skip: params.skip, take: params.take };
      }
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<AccountTransfer>>(`/account-transfers?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const transfersPager = useServerPager<AccountTransfer>({
    fetchPage: (params) => fetchTransfersPage(params),
    enabled: Boolean(token && profile && tab === 'transfers'),
  });

  const loadAssignments = useCallback(
    async (storeId: string) => {
      if (!token || !storeId) return;
      const result = await apiRequest<StoreAccountAssignment[]>(
        `/stores/${storeId}/account-assignments`,
        { method: 'GET' },
        token,
      );
      setAssignmentsByStore((prev) => ({ ...prev, [storeId]: result }));
    },
    [token],
  );

  useEffect(() => {
    if (assignmentStoreId) void loadAssignments(assignmentStoreId);
  }, [assignmentStoreId, loadAssignments]);

  /** Refetches just the journal list, so changing a filter does not reload
   *  accounts, banks, transfers and balances as well. */
  const loadJournals = useCallback(
    async (authToken: string, nextFilters: JournalFilters, nextSkip: number) => {
      setJournalsLoading(true);
      try {
        const page = await apiRequest<JournalPage>(
          `/journal-entries?${journalQuery(nextFilters, nextSkip)}`,
          { method: 'GET' },
          authToken,
        );
        setJournals(page.items);
        setJournalTotal(page.total);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to search journal entries.');
      } finally {
        setJournalsLoading(false);
      }
    },
    [],
  );

  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    for (const account of accounts) map.set(account.id, account);
    return map;
  }, [accounts]);

  const storeMap = useMemo(() => {
    const map = new Map<string, Store>();
    for (const store of stores) map.set(store.id, store);
    return map;
  }, [stores]);

  const canCreateAccount = hasPermission(profile, 'chart-of-account.create');
  const canCreateJournal = hasPermission(profile, 'journal-entry.create');
  const canUpdateJournal = hasPermission(profile, 'journal-entry.update');
  const canDeleteJournal = hasPermission(profile, 'journal-entry.delete');
  const canCreateBank = hasPermission(profile, 'bank-account.create');
  const canUpdateBank = hasPermission(profile, 'bank-account.update');
  const canDeleteBank = hasPermission(profile, 'bank-account.delete');
  const canCreateTransfer = hasPermission(profile, 'account-transfer.create');
  const canReadAssignments = hasPermission(profile, 'store-account-assignment.read');
  const canCreateAssignment = hasPermission(profile, 'store-account-assignment.create');
  const canDeleteAssignment = hasPermission(profile, 'store-account-assignment.delete');

  function applyJournalFilters() {
    if (!token) return;
    setJournalSkip(0);
    setAppliedFilters(filters);
    void loadJournals(token, filters, 0);
  }

  function resetJournalFilters() {
    const cleared: JournalFilters = {
      search: '',
      storeId: '',
      accountId: '',
      source: '',
      status: '',
      from: '',
      to: '',
      minAmount: '',
      untaggedOnly: false,
    };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setJournalSkip(0);
    if (token) void loadJournals(token, cleared, 0);
  }

  function goToJournalPage(nextSkip: number) {
    if (!token) return;
    setJournalSkip(nextSkip);
    void loadJournals(token, appliedFilters, nextSkip);
  }

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
      await load(token);
      transfersPager.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setMutating(false);
    }
  }

  async function onCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateAccount) return;
    await runMutation(async () => {
      await apiRequest(
        '/chart-of-accounts',
        { method: 'POST', body: JSON.stringify({ code: accountCode, name: accountName, type: accountType }) },
        token,
      );
      setShowAccountForm(false);
      setAccountCode('');
      setAccountName('');
    }, 'Account created.');
  }

  const journalTotals = useMemo(() => {
    const totalDebit = journalLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = journalLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0 };
  }, [journalLines]);

  async function onCreateJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateJournal) return;
    if (!journalTotals.balanced) {
      setErrorMessage('Journal must balance: total debits must equal total credits.');
      return;
    }

    await runMutation(async () => {
      await apiRequest(
        '/journal-entries',
        {
          method: 'POST',
          body: JSON.stringify({
            memo: journalMemo || undefined,
            entryDate: journalDate || undefined,
            postedBy: profile?.email,
            lines: journalLines
              .filter((line) => line.accountId && (Number(line.debit) > 0 || Number(line.credit) > 0))
              .map((line) => ({
                accountId: line.accountId,
                debit: Number(line.debit || 0),
                credit: Number(line.credit || 0),
                memo: line.memo || undefined,
                // Fall back to the form default so a line is never silently
                // untagged and missing from store reports.
                storeId: line.storeId || journalDefaultStoreId || undefined,
              })),
          }),
        },
        token,
      );
      // Form stays open and keeps store/date: this screen is used to enter
      // long runs of historical spend one line at a time.
      setJournalMemo('');
      setJournalLines([
        { accountId: '', debit: '', credit: '', memo: '', storeId: journalDefaultStoreId },
        { accountId: '', debit: '', credit: '', memo: '', storeId: '' },
      ]);
    }, 'Journal entry posted.');
  }

  function startRecategorise(entry: JournalEntry) {
    setRecategoriseEntryId(entry.id);
    setRecategoriseLines(
      entry.lines.map((line) => ({
        lineId: line.id,
        accountId: line.accountId,
        storeId: line.storeId || '',
        amountLabel:
          Number(line.debit) > 0
            ? `${formatMoney(line.debit)} Dr`
            : `${formatMoney(line.credit)} Cr`,
      })),
    );
  }

  async function onRecategorise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateJournal || !recategoriseEntryId) return;

    await runMutation(async () => {
      await apiRequest(
        `/journal-entries/${recategoriseEntryId}/recategorise`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            lines: recategoriseLines.map((line) => ({
              lineId: line.lineId,
              accountId: line.accountId,
              // Empty means detach from any store, which the API accepts as null.
              storeId: line.storeId || null,
            })),
          }),
        },
        token,
      );
      setRecategoriseEntryId(null);
    }, 'Journal entry recategorised.');
  }

  async function onDeleteJournal(entry: JournalEntry) {
    if (!token || !canDeleteJournal) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Journal Entry',
      message: `Permanently remove ${entry.entryNumber} and both sides of it? Use Reverse instead if this entry was genuine but wrong — deletion leaves no trace in the ledger.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/journal-entries/${entry.id}`, { method: 'DELETE' }, token);
    }, 'Journal entry deleted.');
  }

  async function onReverseJournal(id: string) {
    if (!token || !canUpdateJournal) return;
    const confirmed = await dialog.confirm({
      title: 'Reverse Journal Entry',
      message: 'Reverse this journal entry? This posts a mirrored entry and marks the original as reversed.',
      confirmLabel: 'Reverse',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/journal-entries/${id}/reverse`, { method: 'POST', body: JSON.stringify({ postedBy: profile?.email }) }, token);
    }, 'Journal entry reversed.');
  }

  async function onCreateBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateBank) return;
    await runMutation(async () => {
      await apiRequest(
        '/bank-accounts',
        {
          method: 'POST',
          body: JSON.stringify({
            type: bankForm.type,
            name: bankForm.name,
            bankName: bankForm.bankName,
            accountNumber: bankForm.accountNumber,
            branch: bankForm.branch || undefined,
            glAccountId: bankForm.glAccountId,
            storeId: bankForm.storeId || undefined,
          }),
        },
        token,
      );
      setShowBankForm(false);
      setBankForm(makeBankAccountForm());
    }, 'Account added.');
  }

  async function onUpdateBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateBank || !editingBankId) return;
    await runMutation(async () => {
      await apiRequest(
        `/bank-accounts/${editingBankId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            type: bankEditForm.type,
            name: bankEditForm.name,
            bankName: bankEditForm.bankName,
            accountNumber: bankEditForm.accountNumber,
            branch: bankEditForm.branch || undefined,
            isActive: bankEditForm.isActive,
            storeId: bankEditForm.storeId || null,
          }),
        },
        token,
      );
      setEditingBankId(null);
    }, 'Account updated.');
  }

  async function onDeleteBank(id: string) {
    if (!token || !canDeleteBank) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Account',
      message: 'Delete this account? Only possible if it has no posted transactions or reconciliations.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/bank-accounts/${id}`, { method: 'DELETE' }, token);
    }, 'Account deleted.');
  }

  async function onCreateTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateTransfer) return;
    await runMutation(async () => {
      await apiRequest(
        '/account-transfers',
        {
          method: 'POST',
          body: JSON.stringify({
            fromAccountId: transferForm.fromAccountId,
            toAccountId: transferForm.toAccountId,
            amount: Number(transferForm.amount),
            memo: transferForm.memo || undefined,
            createdBy: profile?.email,
          }),
        },
        token,
      );
      setShowTransferForm(false);
      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', memo: '' });
    }, 'Transfer posted.');
  }

  async function onCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateAssignment || !assignmentStoreId) return;
    await runMutation(async () => {
      await apiRequest(
        `/stores/${assignmentStoreId}/account-assignments`,
        { method: 'POST', body: JSON.stringify(assignmentForm) },
        token,
      );
      await loadAssignments(assignmentStoreId);
      setAssignmentForm({ purpose: 'SALES', bankAccountId: '' });
    }, 'Assignment saved.');
  }

  async function onDeleteAssignment(id: string) {
    if (!token || !canDeleteAssignment || !assignmentStoreId) return;
    await runMutation(async () => {
      await apiRequest(`/stores/${assignmentStoreId}/account-assignments/${id}`, { method: 'DELETE' }, token);
      await loadAssignments(assignmentStoreId);
    }, 'Assignment removed.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading general ledger...</article>
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
            pageTitle="General Ledger"
            pageSubtitle="Chart of accounts, manual & reversing journals, and bank/mobile money accounts."
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


            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <button type="button" className={`portal-inline-btn${tab === 'journals' ? ' is-active' : ''}`} onClick={() => setTab('journals')}>
                Journal Entries
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'chart' ? ' is-active' : ''}`} onClick={() => setTab('chart')}>
                Chart of Accounts
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'banks' ? ' is-active' : ''}`} onClick={() => setTab('banks')}>
                Bank &amp; Mobile Money
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'transfers' ? ' is-active' : ''}`} onClick={() => setTab('transfers')}>
                Transfers
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'assignments' ? ' is-active' : ''}`} onClick={() => setTab('assignments')}>
                Store Account Assignments
              </button>
            </div>

            {tab === 'journals' ? (
              <article className="portal-card" data-tour="ledger.entries">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Journal Entries</h2><TourLauncher tour="accounting-basics" />
                  {canCreateJournal ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowJournalForm((prev) => !prev)}>
                      {showJournalForm ? 'Close' : 'New Manual Journal'}
                    </button>
                  ) : null}
                </div>

                {showJournalForm && canCreateJournal ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateJournal}>
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Memo</span>
                        <input value={journalMemo} onChange={(event) => setJournalMemo(event.target.value)} />
                      </label>
                      <label>
                        <span>Entry Date</span>
                        <input
                          type="date"
                          value={journalDate}
                          onChange={(event) => setJournalDate(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Default Store</span>
                        <select
                          value={journalDefaultStoreId}
                          onChange={(event) => {
                            const next = event.target.value;
                            setJournalDefaultStoreId(next);
                            // Apply to lines the user has not set individually,
                            // so a whole batch can be tagged in one action.
                            setJournalLines((prev) =>
                              prev.map((item) => (item.storeId ? item : { ...item, storeId: next })),
                            );
                          }}
                        >
                          <option value="">No store</option>
                          {stores.map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.code} — {store.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="portal-muted" style={{ margin: 0 }}>
                      Expense lines need a store to appear on that store&apos;s cost report. Date and
                      default store are kept after posting so consecutive entries stay quick.
                    </p>

                    {journalLines.map((line, index) => (
                      <div key={index} className="portal-entity-grid-4">
                        <label>
                          <span>Account</span>
                          <select
                            value={line.accountId}
                            onChange={(event) =>
                              setJournalLines((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, accountId: event.target.value } : item)))
                            }
                            required
                          >
                            <option value="">Select account</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} — {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Debit</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.debit}
                            onChange={(event) =>
                              setJournalLines((prev) =>
                                prev.map((item, itemIndex) => (itemIndex === index ? { ...item, debit: event.target.value, credit: '' } : item)),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Credit</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.credit}
                            onChange={(event) =>
                              setJournalLines((prev) =>
                                prev.map((item, itemIndex) => (itemIndex === index ? { ...item, credit: event.target.value, debit: '' } : item)),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Store</span>
                          <select
                            value={line.storeId}
                            onChange={(event) =>
                              setJournalLines((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, storeId: event.target.value } : item,
                                ),
                              )
                            }
                          >
                            <option value="">No store</option>
                            {stores.map((store) => (
                              <option key={store.id} value={store.id}>
                                {store.code} — {store.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}

                    <div className="portal-action-row">
                      <button
                        type="button"
                        className="portal-inline-btn"
                        onClick={() =>
                          setJournalLines((prev) => [
                            ...prev,
                            { accountId: '', debit: '', credit: '', memo: '', storeId: journalDefaultStoreId },
                          ])
                        }
                      >
                        Add Line
                      </button>
                      {journalLines.length > 2 ? (
                        <button type="button" className="portal-inline-btn is-danger" onClick={() => setJournalLines((prev) => prev.slice(0, -1))}>
                          Remove Last Line
                        </button>
                      ) : null}
                    </div>

                    <p style={{ fontSize: 13, color: journalTotals.balanced ? '#2e7d43' : '#c0392b' }}>
                      Total debits {formatMoney(journalTotals.totalDebit)} — Total credits {formatMoney(journalTotals.totalCredit)}
                      {journalTotals.balanced ? ' (balanced)' : ' (must balance before posting)'}
                    </p>

                    <button type="submit" className="portal-primary-btn" disabled={mutating || !journalTotals.balanced}>
                      {mutating ? 'Posting...' : 'Post Journal'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-entity-form" style={{ marginBottom: 16 }}>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Search</span>
                      <input
                        value={filters.search}
                        placeholder="Entry no, memo, description, account…"
                        onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') applyJournalFilters();
                        }}
                      />
                    </label>
                    <label>
                      <span>Store</span>
                      <select
                        value={filters.storeId}
                        onChange={(event) => setFilters((prev) => ({ ...prev, storeId: event.target.value }))}
                      >
                        <option value="">All stores</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.code} — {store.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Account</span>
                      <select
                        value={filters.accountId}
                        onChange={(event) => setFilters((prev) => ({ ...prev, accountId: event.target.value }))}
                      >
                        <option value="">All accounts</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="portal-entity-grid-4">
                    <label>
                      <span>From</span>
                      <input
                        type="date"
                        value={filters.from}
                        onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>To</span>
                      <input
                        type="date"
                        value={filters.to}
                        onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Source</span>
                      <select
                        value={filters.source}
                        onChange={(event) => setFilters((prev) => ({ ...prev, source: event.target.value }))}
                      >
                        <option value="">All sources</option>
                        {JOURNAL_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {source.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Min Amount</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={filters.minAmount}
                        onChange={(event) => setFilters((prev) => ({ ...prev, minAmount: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="portal-check-row">
                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={filters.status === 'REVERSED'}
                        onChange={(event) =>
                          setFilters((prev) => ({ ...prev, status: event.target.checked ? 'REVERSED' : '' }))
                        }
                      />
                      <span>Only reversed</span>
                    </label>
                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={filters.untaggedOnly}
                        onChange={(event) =>
                          setFilters((prev) => ({ ...prev, untaggedOnly: event.target.checked }))
                        }
                      />
                      <span>Only expense with no store</span>
                    </label>
                  </div>
                  <div className="portal-inline-actions">
                    <button type="button" className="portal-primary-btn" onClick={applyJournalFilters}>
                      Apply Filters
                    </button>
                    <button type="button" className="portal-ghost-btn" onClick={resetJournalFilters}>
                      Reset
                    </button>
                    <span className="portal-muted" style={{ alignSelf: 'center' }}>
                      {journalsLoading
                        ? 'Searching…'
                        : journalTotal === 0
                          ? 'No matching entries'
                          : `Showing ${journalSkip + 1}–${Math.min(journalSkip + JOURNAL_PAGE_SIZE, journalTotal)} of ${journalTotal.toLocaleString()}`}
                    </span>
                  </div>
                </div>

                <div className="portal-list-stack">
                  {journals.length === 0 ? (
                    <div className="portal-empty-state">No entries match these filters.</div>
                  ) : (
                    journals.map((entry) => (
                      <div key={entry.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{entry.entryNumber}</strong>
                            <p>{entry.memo || 'No memo'}</p>
                            <p>
                              {entry.source} • {formatDate(entry.entryDate)} • By {entry.postedBy}
                            </p>
                          </div>
                          <span>{entry.status}</span>
                          <span>{entry.lines.length} lines</span>
                        </div>
                        <div className="portal-list-stack" style={{ marginTop: 8 }}>
                          {entry.lines.map((line) => {
                            const account = line.account || accountMap.get(line.accountId);
                            const untaggedExpense = account?.type === 'EXPENSE' && !line.storeId;
                            return (
                              <div key={line.id} className="portal-list-row" style={{ fontSize: 13 }}>
                                <span>
                                  {account?.code} — {account?.name}
                                  {line.storeId ? (
                                    <> • {storeMap.get(line.storeId)?.code || 'store'}</>
                                  ) : untaggedExpense ? (
                                    <> • no store</>
                                  ) : null}
                                </span>
                                <span>{Number(line.debit) > 0 ? formatMoney(line.debit) : ''}</span>
                                <span>{Number(line.credit) > 0 ? formatMoney(line.credit) : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                        {canUpdateJournal && entry.status === 'POSTED' ? (
                          <div className="portal-action-row">
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() =>
                                recategoriseEntryId === entry.id
                                  ? setRecategoriseEntryId(null)
                                  : startRecategorise(entry)
                              }
                            >
                              {recategoriseEntryId === entry.id ? 'Cancel' : 'Recategorise'}
                            </button>
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onReverseJournal(entry.id)}>
                              Reverse
                            </button>
                            {canDeleteJournal && entry.source === 'MANUAL' ? (
                              <button
                                type="button"
                                className="portal-inline-btn is-danger"
                                onClick={() => void onDeleteJournal(entry)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {recategoriseEntryId === entry.id && canUpdateJournal ? (
                          <form className="portal-entity-form portal-inline-form" onSubmit={onRecategorise}>
                            <p className="portal-muted" style={{ margin: 0 }}>
                              Move these lines to the right account or store. Amounts and dates cannot be
                              changed here — use Reverse if the figures themselves are wrong.
                            </p>
                            {recategoriseLines.map((line, index) => (
                              <div key={line.lineId} className="portal-entity-grid-3">
                                <label>
                                  <span>Account</span>
                                  <select
                                    value={line.accountId}
                                    onChange={(event) =>
                                      setRecategoriseLines((prev) =>
                                        prev.map((item, itemIndex) =>
                                          itemIndex === index ? { ...item, accountId: event.target.value } : item,
                                        ),
                                      )
                                    }
                                  >
                                    {accounts.map((account) => (
                                      <option key={account.id} value={account.id}>
                                        {account.code} — {account.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>Store</span>
                                  <select
                                    value={line.storeId}
                                    onChange={(event) =>
                                      setRecategoriseLines((prev) =>
                                        prev.map((item, itemIndex) =>
                                          itemIndex === index ? { ...item, storeId: event.target.value } : item,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">No store</option>
                                    {stores.map((store) => (
                                      <option key={store.id} value={store.id}>
                                        {store.code} — {store.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>Amount (read-only)</span>
                                  <input value={line.amountLabel} readOnly />
                                </label>
                              </div>
                            ))}
                            <div className="portal-inline-actions">
                              <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                {mutating ? 'Saving...' : 'Save Categories'}
                              </button>
                              <button type="button" className="portal-ghost-btn" onClick={() => setRecategoriseEntryId(null)}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                {journalTotal > JOURNAL_PAGE_SIZE ? (
                  <div className="portal-inline-actions" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="portal-inline-btn"
                      disabled={journalSkip === 0 || journalsLoading}
                      onClick={() => goToJournalPage(Math.max(journalSkip - JOURNAL_PAGE_SIZE, 0))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="portal-inline-btn"
                      disabled={journalSkip + JOURNAL_PAGE_SIZE >= journalTotal || journalsLoading}
                      onClick={() => goToJournalPage(journalSkip + JOURNAL_PAGE_SIZE)}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </article>
            ) : null}

            {tab === 'chart' ? (
              <article className="portal-card" data-tour="ledger.chart">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Chart of Accounts</h2>
                  {canCreateAccount ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowAccountForm((prev) => !prev)}>
                      {showAccountForm ? 'Close' : 'New Account'}
                    </button>
                  ) : null}
                </div>

                {showAccountForm && canCreateAccount ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateAccount}>
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Code</span>
                        <input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} required />
                      </label>
                      <label>
                        <span>Name</span>
                        <input value={accountName} onChange={(event) => setAccountName(event.target.value)} required />
                      </label>
                      <label>
                        <span>Type</span>
                        <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                          <option value="ASSET">ASSET</option>
                          <option value="LIABILITY">LIABILITY</option>
                          <option value="EQUITY">EQUITY</option>
                          <option value="REVENUE">REVENUE</option>
                          <option value="EXPENSE">EXPENSE</option>
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Create Account'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {accounts.length === 0 ? (
                    <div className="portal-empty-state">No accounts configured yet.</div>
                  ) : (
                    accounts.map((account) => (
                      <div key={account.id} className="portal-list-row">
                        <div>
                          <strong>
                            {account.code} — {account.name}
                          </strong>
                          {account.subtype ? <p>{account.subtype}</p> : null}
                        </div>
                        <span>{account.type}</span>
                        <span>{account.isSystem ? 'SYSTEM' : ''}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ) : null}

            {tab === 'banks' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Bank &amp; Mobile Money Accounts</h2>
                  {canCreateBank ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        setBankForm(makeBankAccountForm());
                        setShowBankForm((prev) => !prev);
                      }}
                    >
                      {showBankForm ? 'Close' : 'New Account'}
                    </button>
                  ) : null}
                </div>

                {showBankForm && canCreateBank ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateBank}>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Account Type</span>
                        <select value={bankForm.type} onChange={(event) => setBankForm((prev) => ({ ...prev, type: event.target.value as any }))}>
                          <option value="BANK">Bank Account</option>
                          <option value="MOBILE_MONEY">Mobile Money</option>
                        </select>
                      </label>
                      <label>
                        <span>Account Name</span>
                        <input value={bankForm.name} onChange={(event) => setBankForm((prev) => ({ ...prev, name: event.target.value }))} required />
                      </label>
                    </div>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>{bankForm.type === 'MOBILE_MONEY' ? 'Provider (e.g. M-Pesa)' : 'Bank Name'}</span>
                        <input value={bankForm.bankName} onChange={(event) => setBankForm((prev) => ({ ...prev, bankName: event.target.value }))} required />
                      </label>
                      <label>
                        <span>{bankForm.type === 'MOBILE_MONEY' ? 'Phone / Till Number' : 'Account Number'}</span>
                        <input
                          value={bankForm.accountNumber}
                          onChange={(event) => setBankForm((prev) => ({ ...prev, accountNumber: event.target.value }))}
                          required
                        />
                      </label>
                    </div>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Branch (optional)</span>
                        <input value={bankForm.branch} onChange={(event) => setBankForm((prev) => ({ ...prev, branch: event.target.value }))} />
                      </label>
                      <label>
                        <span>GL Account</span>
                        <select value={bankForm.glAccountId} onChange={(event) => setBankForm((prev) => ({ ...prev, glAccountId: event.target.value }))} required>
                          <option value="">Select GL account</option>
                          {accounts
                            .filter((account) => account.type === 'ASSET')
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} — {account.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Store (optional — leave blank for a shared company account)</span>
                        <select value={bankForm.storeId} onChange={(event) => setBankForm((prev) => ({ ...prev, storeId: event.target.value }))}>
                          <option value="">Shared / company-level account</option>
                          {stores.map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.code} — {store.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Add Account'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {bankAccounts.length === 0 ? (
                    <div className="portal-empty-state">No bank or mobile money accounts yet.</div>
                  ) : (
                    bankAccounts.map((bank) => (
                      <div key={bank.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>
                              {bank.name} {bank.isActive ? '' : '(inactive)'}
                            </strong>
                            <p>
                              {bank.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank'} • {bank.bankName} • {bank.accountNumber}
                            </p>
                            <p>{bank.storeId ? `Store: ${stores.find((store) => store.id === bank.storeId)?.name || bank.storeId}` : 'Shared / company-level account'}</p>
                          </div>
                          <span>{bank.currencyCode}</span>
                          <span>{formatMoney(bankBalances[bank.id] ?? 0, bank.currencyCode)}</span>
                        </div>

                        <div className="portal-action-row">
                          {canUpdateBank ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                if (editingBankId === bank.id) {
                                  setEditingBankId(null);
                                } else {
                                  setEditingBankId(bank.id);
                                  setBankEditForm(makeBankAccountForm(bank));
                                }
                              }}
                            >
                              {editingBankId === bank.id ? 'Cancel' : 'Edit'}
                            </button>
                          ) : null}
                          {canDeleteBank ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDeleteBank(bank.id)}>
                              Delete
                            </button>
                          ) : null}
                        </div>

                        {editingBankId === bank.id && canUpdateBank ? (
                          <form className="portal-entity-form portal-inline-form" onSubmit={onUpdateBank}>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Account Type</span>
                                <select
                                  value={bankEditForm.type}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, type: event.target.value as any }))}
                                >
                                  <option value="BANK">Bank Account</option>
                                  <option value="MOBILE_MONEY">Mobile Money</option>
                                </select>
                              </label>
                              <label>
                                <span>Account Name</span>
                                <input
                                  value={bankEditForm.name}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                  required
                                />
                              </label>
                            </div>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>{bankEditForm.type === 'MOBILE_MONEY' ? 'Provider' : 'Bank Name'}</span>
                                <input
                                  value={bankEditForm.bankName}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, bankName: event.target.value }))}
                                  required
                                />
                              </label>
                              <label>
                                <span>{bankEditForm.type === 'MOBILE_MONEY' ? 'Phone / Till Number' : 'Account Number'}</span>
                                <input
                                  value={bankEditForm.accountNumber}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, accountNumber: event.target.value }))}
                                  required
                                />
                              </label>
                            </div>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Branch (optional)</span>
                                <input
                                  value={bankEditForm.branch}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, branch: event.target.value }))}
                                />
                              </label>
                              <label className="portal-check">
                                <input
                                  type="checkbox"
                                  checked={bankEditForm.isActive}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                />
                                <span>Active</span>
                              </label>
                            </div>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Store (optional)</span>
                                <select
                                  value={bankEditForm.storeId}
                                  onChange={(event) => setBankEditForm((prev) => ({ ...prev, storeId: event.target.value }))}
                                >
                                  <option value="">Shared / company-level account</option>
                                  {stores.map((store) => (
                                    <option key={store.id} value={store.id}>
                                      {store.code} — {store.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="portal-inline-actions">
                              <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                Save
                              </button>
                              <button type="button" className="portal-ghost-btn" onClick={() => setEditingBankId(null)}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </article>
            ) : null}

            {tab === 'transfers' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Inter-Account Transfers</h2>
                  {canCreateTransfer ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowTransferForm((prev) => !prev)}>
                      {showTransferForm ? 'Close' : 'New Transfer'}
                    </button>
                  ) : null}
                </div>

                {showTransferForm && canCreateTransfer ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateTransfer}>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>From Account</span>
                        <select
                          value={transferForm.fromAccountId}
                          onChange={(event) => setTransferForm((prev) => ({ ...prev, fromAccountId: event.target.value }))}
                          required
                        >
                          <option value="">Select account</option>
                          {bankAccounts.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name} ({bank.currencyCode})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>To Account</span>
                        <select
                          value={transferForm.toAccountId}
                          onChange={(event) => setTransferForm((prev) => ({ ...prev, toAccountId: event.target.value }))}
                          required
                        >
                          <option value="">Select account</option>
                          {bankAccounts
                            .filter((bank) => bank.id !== transferForm.fromAccountId)
                            .map((bank) => (
                              <option key={bank.id} value={bank.id}>
                                {bank.name} ({bank.currencyCode})
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Amount</span>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={transferForm.amount}
                          onChange={(event) => setTransferForm((prev) => ({ ...prev, amount: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        <span>Memo (optional)</span>
                        <input value={transferForm.memo} onChange={(event) => setTransferForm((prev) => ({ ...prev, memo: event.target.value }))} />
                      </label>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Posting...' : 'Post Transfer'}
                    </button>
                  </form>
                ) : null}

                <div className="list-toolbar">
                  <ServerListSearch pager={transfersPager} placeholder="Search transfers…" />
                </div>

                <div className="portal-list-stack">
                  {!transfersPager.loading && transfersPager.items.length === 0 ? (
                    <div className="portal-empty-state">
                      {transfersPager.search ? 'No transfers match.' : 'No transfers yet.'}
                    </div>
                  ) : (
                    transfersPager.items.map((transfer) => (
                      <div key={transfer.id} className="portal-list-row">
                        <div>
                          <strong>{transfer.transferNumber}</strong>
                          <p>
                            {transfer.fromAccount?.name} → {transfer.toAccount?.name}
                            {transfer.memo ? ` • ${transfer.memo}` : ''}
                          </p>
                          <p>{formatDate(transfer.transferDate)}</p>
                        </div>
                        <span>{formatMoney(transfer.amount, transfer.currency)}</span>
                      </div>
                    ))
                  )}
                </div>
                <ServerListPager pager={transfersPager} noun="transfers" />
              </article>
            ) : null}

            {tab === 'assignments' ? (
              <article className="portal-card">
                <h2 style={{ margin: 0 }}>Store Account Assignments</h2>
                <p style={{ fontSize: 13, color: '#5b6161' }}>
                  Choose which bank or mobile money account each store uses for a given purpose — e.g. unit sales
                  can collect into one account while rent and utilities post to others. Unassigned purposes fall back
                  to the store&apos;s account of that type, then the default company Cash and Bank account.
                </p>

                <form className="portal-entity-form portal-detail-form" onSubmit={(event) => event.preventDefault()}>
                  <label>
                    <span>Store</span>
                    <select value={assignmentStoreId} onChange={(event) => setAssignmentStoreId(event.target.value)}>
                      <option value="">Select a store</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.code} — {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </form>

                {assignmentStoreId ? (
                  <>
                    {canCreateAssignment ? (
                      <form className="portal-entity-form portal-detail-form" onSubmit={onCreateAssignment}>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Purpose</span>
                            <select
                              value={assignmentForm.purpose}
                              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, purpose: event.target.value as AccountPurpose }))}
                            >
                              {ACCOUNT_PURPOSES.map((purpose) => (
                                <option key={purpose} value={purpose}>
                                  {PURPOSE_LABELS[purpose]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Bank / Mobile Money Account</span>
                            <select
                              value={assignmentForm.bankAccountId}
                              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, bankAccountId: event.target.value }))}
                              required
                            >
                              <option value="">Select account</option>
                              {bankAccounts.map((bank) => (
                                <option key={bank.id} value={bank.id}>
                                  {bank.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          {mutating ? 'Saving...' : 'Save Assignment'}
                        </button>
                      </form>
                    ) : null}

                    <div className="portal-list-stack">
                      {(assignmentsByStore[assignmentStoreId] || []).length === 0 ? (
                        <div className="portal-empty-state">No assignments configured for this store yet.</div>
                      ) : (
                        (assignmentsByStore[assignmentStoreId] || []).map((assignment) => (
                          <div key={assignment.id} className="portal-list-row">
                            <div>
                              <strong>{PURPOSE_LABELS[assignment.purpose]}</strong>
                              <p>{assignment.bankAccount?.name}</p>
                            </div>
                            {canDeleteAssignment ? (
                              <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDeleteAssignment(assignment.id)}>
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
