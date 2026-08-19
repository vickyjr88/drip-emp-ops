"use client";

import Link from 'next/link';
import { useFeedbackState } from '../components/notifications';
import { useErrorState } from '../components/notifications';
import { ListExport } from '../components/list-export';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { TourLauncher } from '../tours/tour-launcher';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
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
} from '../accounting/lib';

type TargetType = 'SALES_INSTALLMENT' | 'RENT' | 'UTILITY' | 'INVOICE';
type Timing = 'BEFORE_DUE' | 'ON_DUE_DATE' | 'AFTER_DUE_IF_UNPAID';
type Channel = 'SMS' | 'EMAIL' | 'BOTH';
type DispatchStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

type ReminderRule = {
  id: string;
  name: string;
  description?: string | null;
  targetType: TargetType;
  timing: Timing;
  offsetDays: number;
  channel: Channel;
  isActive: boolean;
  projectId?: string | null;
  utilityCategory?: string | null;
  smsTemplate?: string | null;
  emailSubject?: string | null;
  emailTemplate?: string | null;
  updatedAt: string;
};

type PreviewItem = {
  ruleId: string;
  ruleName: string;
  channel: Channel;
  targetType: TargetType;
  targetId: string;
  dueDate: string;
  customerName: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  amountOutstanding: number;
  currency: string;
  description: string;
  smsBody?: string;
  emailSubject?: string;
  skipReason?: string;
};

type ReminderLog = {
  id: string;
  targetType: TargetType;
  targetId: string;
  dueDate: string;
  channel: Channel;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  smsBody?: string | null;
  status: DispatchStatus;
  statusReason?: string | null;
  isManual: boolean;
  triggeredBy?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  sentAt?: string | null;
  createdAt: string;
  rule?: { id: string; name: string } | null;
};

type ReminderStats = {
  logs: Partial<Record<DispatchStatus, number>>;
  queue:
    | { available: false }
    | { available: true; enabled: boolean; cron: string; counts: Record<string, number> };
};

type ProjectOption = { id: string; code: string; name: string };

const TARGET_LABELS: Record<TargetType, string> = {
  SALES_INSTALLMENT: 'Sales Installment',
  RENT: 'Rent',
  UTILITY: 'Utility',
  INVOICE: 'Invoice',
};

const TARGET_ORDER: TargetType[] = ['SALES_INSTALLMENT', 'RENT', 'UTILITY', 'INVOICE'];

const UTILITY_CATEGORIES = [
  'WATER',
  'ELECTRICITY',
  'GARBAGE',
  'SECURITY',
  'INTERNET',
  'PARKING',
  'SERVICE_CHARGE',
  'OTHER',
];

const TIMING_LABELS: Record<Timing, string> = {
  BEFORE_DUE: 'Before due',
  ON_DUE_DATE: 'On due date',
  AFTER_DUE_IF_UNPAID: 'After due, if unpaid',
};

const STATUS_LABELS: Record<DispatchStatus, string> = {
  PENDING: 'Pending',
  SENT: 'Sent',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

/** A failed send is a problem; a skip is expected and shouldn't read as one. */
const STATUS_CHIP: Record<DispatchStatus, string> = {
  PENDING: 'is-muted',
  SENT: 'is-success',
  FAILED: 'is-danger',
  SKIPPED: 'is-muted',
};

/** "15 days before" / "3 days after, if unpaid" — the ladder rung in words. */
function describeTiming(rule: Pick<ReminderRule, 'timing' | 'offsetDays'>): string {
  if (rule.timing === 'ON_DUE_DATE') return 'On the due date';
  const days = `${rule.offsetDays} day${rule.offsetDays === 1 ? '' : 's'}`;
  return rule.timing === 'BEFORE_DUE' ? `${days} before` : `${days} after, if unpaid`;
}

const BLANK_RULE = {
  name: '',
  description: '',
  targetType: 'SALES_INSTALLMENT' as TargetType,
  timing: 'BEFORE_DUE' as Timing,
  offsetDays: 5,
  channel: 'BOTH' as Channel,
  projectId: '',
  utilityCategory: '',
  smsTemplate: '',
  emailSubject: '',
  emailTemplate: '',
  isActive: true,
};

type RuleForm = typeof BLANK_RULE;

export default function RemindersPage() {
  const dialog = usePortalDialog();

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [statusMessage, setStatusMessage] = useFeedbackState();

  const [view, setView] = useState<'rules' | 'preview' | 'logs'>('rules');
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [stats, setStats] = useState<ReminderStats | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(BLANK_RULE);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [previewDate, setPreviewDate] = useState('');
  const [previewProject, setPreviewProject] = useState('');
  const [previewItems, setPreviewItems] = useState<PreviewItem[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [logStatus, setLogStatus] = useState<DispatchStatus | ''>('');
  const [logTarget, setLogTarget] = useState<TargetType | ''>('');
  const [logExportRows, setLogExportRows] = useState<ReminderLog[]>([]);

  const canEdit = hasPermission(profile, 'reminder-rule.update');
  const canCreate = hasPermission(profile, 'reminder-rule.create');
  const canTrigger = hasPermission(profile, 'reminder-log.create');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const loadRules = useCallback(async (authToken: string) => {
    const [nextRules, nextStats] = await Promise.all([
      apiRequest<ReminderRule[]>('/reminders/rules', { method: 'GET' }, authToken),
      apiRequest<ReminderStats>('/reminders/stats', { method: 'GET' }, authToken).catch(() => null),
    ]);
    setRules(nextRules);
    if (nextStats) setStats(nextStats);
  }, []);

  const init = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const nextProfile = await loadProfile(authToken);
        setProfile(nextProfile);
        await loadRules(authToken);
        // Project scoping is optional; a missing project.read just leaves the
        // picker empty rather than failing the page.
        if (hasPermission(nextProfile, 'project.read')) {
          try {
            setProjects(await apiRequest<ProjectOption[]>('/projects', { method: 'GET' }, authToken));
          } catch {
            setProjects([]);
          }
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load reminders.');
      } finally {
        setLoading(false);
      }
    },
    [loadRules],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void init(token);
  }, [initialized, token, init]);

  const fetchLogsPage = useCallback(
    async (
      params: { skip: number; take: number; search: string } & { status: DispatchStatus | ''; targetType: TargetType | '' },
    ): Promise<ServerPage<ReminderLog>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      if (params.targetType) query.set('targetType', params.targetType);
      return apiRequest<ServerPage<ReminderLog>>(`/reminders/logs?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const logsPager = useServerPager<ReminderLog, { status: DispatchStatus | ''; targetType: TargetType | '' }>({
    fetchPage: (params) => fetchLogsPage(params),
    filters: { status: logStatus, targetType: logTarget },
    enabled: Boolean(token && view === 'logs'),
  });

  useEffect(() => {
    if (!token || view !== 'logs') return;
    const timer = setTimeout(() => {
      void fetchLogsPage({ skip: 0, take: 500, search: logsPager.search, status: logStatus, targetType: logTarget }).then(
        (page) => setLogExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchLogsPage, logsPager.search, logStatus, logTarget, token, view]);

  /** Rules grouped into ladders, so the cadence per target reads at a glance. */
  const laddersByTarget = useMemo(() => {
    const grouped = new Map<TargetType, ReminderRule[]>();
    for (const rule of rules) {
      const list = grouped.get(rule.targetType) || [];
      list.push(rule);
      grouped.set(rule.targetType, list);
    }
    // Earliest warning first, then the chases: the order they actually fire.
    const weight = (rule: ReminderRule) =>
      rule.timing === 'BEFORE_DUE' ? -rule.offsetDays : rule.timing === 'ON_DUE_DATE' ? 0 : rule.offsetDays;
    Array.from(grouped.values()).forEach((list) => {
      list.sort((a: ReminderRule, b: ReminderRule) => weight(a) - weight(b));
    });
    return grouped;
  }, [rules]);

  function openCreate() {
    setEditingId(null);
    setForm(BLANK_RULE);
    setShowForm(true);
    setStatusMessage(null);
  }

  function openEdit(rule: ReminderRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      description: rule.description || '',
      targetType: rule.targetType,
      timing: rule.timing,
      offsetDays: rule.offsetDays,
      channel: rule.channel,
      projectId: rule.projectId || '',
      utilityCategory: rule.utilityCategory || '',
      smsTemplate: rule.smsTemplate || '',
      emailSubject: rule.emailSubject || '',
      emailTemplate: rule.emailTemplate || '',
      isActive: rule.isActive,
    });
    setShowForm(true);
    setStatusMessage(null);
  }

  async function onSaveRule() {
    if (!token || saving) return;
    if (!form.name.trim()) {
      setErrorMessage('Give the rule a name.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        targetType: form.targetType,
        timing: form.timing,
        // The API takes a positive offset; timing carries the direction.
        offsetDays: form.timing === 'ON_DUE_DATE' ? 0 : Number(form.offsetDays),
        channel: form.channel,
        projectId: form.projectId || null,
        utilityCategory: form.targetType === 'UTILITY' && form.utilityCategory ? form.utilityCategory : null,
        smsTemplate: form.smsTemplate || undefined,
        emailSubject: form.emailSubject || undefined,
        emailTemplate: form.emailTemplate || undefined,
        isActive: form.isActive,
      };

      if (editingId) {
        await apiRequest(`/reminders/rules/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
      } else {
        await apiRequest('/reminders/rules', { method: 'POST', body: JSON.stringify(body) }, token);
      }

      await loadRules(token);
      setShowForm(false);
      setEditingId(null);
      setStatusMessage(editingId ? 'Rule updated.' : 'Rule created.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the rule.');
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(rule: ReminderRule) {
    if (!token) return;
    try {
      await apiRequest(
        `/reminders/rules/${rule.id}`,
        { method: 'PATCH', body: JSON.stringify({ isActive: !rule.isActive }) },
        token,
      );
      await loadRules(token);
      setStatusMessage(`${rule.name} ${rule.isActive ? 'paused' : 'resumed'}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the rule.');
    }
  }

  async function onDeleteRule(rule: ReminderRule) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete reminder rule',
      message: `Delete "${rule.name}"? Past delivery logs are kept.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/reminders/rules/${rule.id}`, { method: 'DELETE' }, token);
      await loadRules(token);
      setStatusMessage('Rule deleted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete the rule.');
    }
  }

  async function onRunPreview() {
    if (!token) return;
    setPreviewLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (previewDate) params.set('runDate', previewDate);
      if (previewProject) params.set('projectId', previewProject);
      const result = await apiRequest<{ items: PreviewItem[] }>(
        `/reminders/preview?${params}`,
        { method: 'GET' },
        token,
      );
      setPreviewItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to run the preview.');
      setPreviewItems(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  /**
   * Sends what the preview showed. Confirmed explicitly because, unlike every
   * other button here, this one messages real customers.
   */
  async function onSendNow() {
    if (!token || !previewItems?.length) return;
    const confirmed = await dialog.confirm({
      title: 'Send reminders now',
      message: `This will send ${previewItems.length} reminder(s) to customers. Charges already reminded today are skipped automatically.`,
      confirmLabel: 'Send',
    });
    if (!confirmed) return;

    try {
      await apiRequest(
        '/reminders/trigger',
        { method: 'POST', body: JSON.stringify({ projectId: previewProject || undefined }) },
        token,
      );
      setStatusMessage('Reminder run queued. Check the delivery log for results.');
      setView('logs');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue the run.');
    }
  }

  /** Chases one specific charge outside its schedule. */
  async function onSendSingle(item: PreviewItem) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Send this reminder',
      message: `Send to ${item.customerName} about ${item.description}?`,
      confirmLabel: 'Send',
    });
    if (!confirmed) return;

    try {
      await apiRequest(
        '/reminders/trigger',
        {
          method: 'POST',
          body: JSON.stringify({
            ruleIds: [item.ruleId],
            // Utility ids are composite (tenancyId:CATEGORY); the API resolves
            // the owning record from the prefix.
            targetId: item.targetId.split(':')[0],
            ignoreTiming: true,
          }),
        },
        token,
      );
      setStatusMessage(`Reminder queued for ${item.customerName}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue the reminder.');
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
            <article className="portal-card portal-loading">Loading reminders...</article>
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

  const queue = stats?.queue;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="reminders"
            pageTitle="Payment Reminders"
            pageSubtitle="Configurable SMS and email reminders for installments, rent, utilities and invoices."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {statusMessage ? <article className="portal-card portal-role-banner">{statusMessage}</article> : null}

            <div className="portal-stats-grid" style={{ marginBottom: 16 }}>
              <article className="portal-card portal-stat-card">
                <p>Active Rules</p>
                <h3>{rules.filter((rule) => rule.isActive).length}</h3>
                <span className="portal-stat-note">{rules.length} configured</span>
              </article>
              <article className="portal-card portal-stat-card">
                <p>Sent</p>
                <h3>{stats?.logs?.SENT ?? 0}</h3>
                <span className="portal-stat-note">All time</span>
              </article>
              <article className="portal-card portal-stat-card">
                <p>Failed</p>
                <h3>{stats?.logs?.FAILED ?? 0}</h3>
                <span className="portal-stat-note">{stats?.logs?.SKIPPED ?? 0} skipped</span>
              </article>
              <article className="portal-card portal-stat-card">
                <p>Scheduler</p>
                <h3>{queue?.available ? (queue.enabled ? 'On' : 'Paused') : 'Offline'}</h3>
                <span className="portal-stat-note">
                  {queue?.available
                    ? `${queue.cron} · ${queue.counts?.waiting ?? 0} waiting`
                    : 'Redis unavailable — manual sends run inline'}
                </span>
              </article>
            </div>

            <div className="portal-action-row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
              {(['rules', 'preview', 'logs'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`portal-inline-btn${view === key ? ' is-active' : ''}`}
                  onClick={() => setView(key)}
                >
                  {key === 'rules' ? 'Rules' : key === 'preview' ? 'Preview & Send' : 'Delivery Log'}
                </button>
              ))}
            </div>

            {view === 'rules' ? (
              <>
                <article className="portal-card" style={{ marginBottom: 16 }} data-tour="reminders.ladders">
                  <div className="portal-card-header-row">
                    <div>
                      <h2 style={{ margin: 0 }}>Reminder ladders</h2><TourLauncher tour="reminders-setup" />
                      <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                        Each rule fires at a fixed offset from the due date. Several rules on one target make a ladder.
                        Charges that have been paid are never chased.
                      </p>
                    </div>
                    {canCreate ? (
                      <button type="button" className="portal-primary-btn" onClick={openCreate}>
                        New rule
                      </button>
                    ) : null}
                  </div>
                </article>

                {TARGET_ORDER.filter((target) => laddersByTarget.has(target)).map((target) => (
                  <article key={target} className="portal-card" style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 4px' }}>{TARGET_LABELS[target]}</h3>
                    <p className="portal-muted" style={{ margin: '0 0 14px' }}>
                      {(laddersByTarget.get(target) || [])
                        .filter((rule) => rule.isActive)
                        .map(describeTiming)
                        .join(' → ') || 'No active rules'}
                    </p>
                    <div className="portal-list-stack">
                      {(laddersByTarget.get(target) || []).map((rule) => (
                        <div key={rule.id} className="portal-list-row">
                          <div>
                            <strong>{rule.name}</strong>
                            <p>
                              {describeTiming(rule)} · {rule.channel}
                              {rule.utilityCategory ? ` · ${rule.utilityCategory}` : ''}
                              {rule.projectId
                                ? ` · ${projects.find((p) => p.id === rule.projectId)?.name || 'One project'}`
                                : ' · All projects'}
                            </p>
                          </div>
                          <span className={`portal-chip${rule.isActive ? '' : ' is-muted'}`}>
                            {rule.isActive ? 'Active' : 'Paused'}
                          </span>
                          {canEdit ? (
                            <button type="button" className="portal-inline-btn" onClick={() => onToggleActive(rule)}>
                              {rule.isActive ? 'Pause' : 'Resume'}
                            </button>
                          ) : null}
                          {canEdit ? (
                            <button type="button" className="portal-inline-btn" onClick={() => openEdit(rule)}>
                              Edit
                            </button>
                          ) : null}
                          {canEdit ? (
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() => void onDeleteRule(rule)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}

                {rules.length === 0 ? (
                  <article className="portal-card">
                    <div className="portal-empty-state">
                      No reminder rules yet. Create one to start reminding customers about payments.
                    </div>
                  </article>
                ) : null}

                {showForm ? (
                  <article className="portal-card">
                    <h2 style={{ margin: '0 0 12px' }}>{editingId ? 'Edit rule' : 'New rule'}</h2>
                    <div className="portal-entity-form">
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Name</span>
                          <input
                            type="text"
                            value={form.name}
                            placeholder="e.g. Installment due in 15 days"
                            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Applies to</span>
                          <select
                            value={form.targetType}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, targetType: event.target.value as TargetType }))
                            }
                          >
                            {TARGET_ORDER.map((target) => (
                              <option key={target} value={target}>
                                {TARGET_LABELS[target]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Timing</span>
                          <select
                            value={form.timing}
                            onChange={(event) => setForm((prev) => ({ ...prev, timing: event.target.value as Timing }))}
                          >
                            {(Object.keys(TIMING_LABELS) as Timing[]).map((timing) => (
                              <option key={timing} value={timing}>
                                {TIMING_LABELS[timing]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {form.timing !== 'ON_DUE_DATE' ? (
                          <label>
                            <span>Days from due date</span>
                            <input
                              type="number"
                              min="0"
                              max="365"
                              value={form.offsetDays}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, offsetDays: Number(event.target.value) }))
                              }
                            />
                          </label>
                        ) : null}
                        <label>
                          <span>Channel</span>
                          <select
                            value={form.channel}
                            onChange={(event) => setForm((prev) => ({ ...prev, channel: event.target.value as Channel }))}
                          >
                            <option value="BOTH">SMS &amp; Email</option>
                            <option value="SMS">SMS only</option>
                            <option value="EMAIL">Email only</option>
                          </select>
                        </label>
                        <label>
                          <span>Project</span>
                          <select
                            value={form.projectId}
                            onChange={(event) => setForm((prev) => ({ ...prev, projectId: event.target.value }))}
                          >
                            <option value="">All projects</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.code} — {project.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {form.targetType === 'UTILITY' ? (
                          <label>
                            <span>Utility</span>
                            <select
                              value={form.utilityCategory}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, utilityCategory: event.target.value }))
                              }
                            >
                              <option value="">All utilities</option>
                              {UTILITY_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                  {category.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>

                      <label className="portal-cms-field">
                        <span>SMS message</span>
                        <textarea
                          rows={3}
                          value={form.smsTemplate}
                          placeholder="Leave blank to use the default wording."
                          onChange={(event) => setForm((prev) => ({ ...prev, smsTemplate: event.target.value }))}
                        />
                        <small className="portal-muted">
                          Variables: {'{{customerName}} {{amount}} {{currency}} {{dueDate}} {{daysUntilDue}}'}{' '}
                          {'{{daysOverdue}} {{unitNumber}} {{projectName}} {{description}} {{reference}}'}
                        </small>
                      </label>

                      <label className="portal-cms-field">
                        <span>Email subject</span>
                        <input
                          type="text"
                          value={form.emailSubject}
                          onChange={(event) => setForm((prev) => ({ ...prev, emailSubject: event.target.value }))}
                        />
                      </label>

                      <label className="portal-cms-field">
                        <span>Email body</span>
                        <textarea
                          rows={4}
                          value={form.emailTemplate}
                          placeholder="Leave blank to use the default wording. HTML is allowed."
                          onChange={(event) => setForm((prev) => ({ ...prev, emailTemplate: event.target.value }))}
                        />
                      </label>

                      <label className="portal-check">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                        />
                        <span>Active</span>
                      </label>

                      <div className="portal-action-row">
                        <button type="button" className="portal-primary-btn" disabled={saving} onClick={() => void onSaveRule()}>
                          {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create rule'}
                        </button>
                        <button type="button" className="portal-inline-btn" onClick={() => setShowForm(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </article>
                ) : null}
              </>
            ) : null}

            {view === 'preview' ? (
              <>
                <article className="portal-card" style={{ marginBottom: 16 }} data-tour="reminders.dry-run">
                  <h2 style={{ margin: '0 0 4px' }}>Dry run</h2>
                  <p className="portal-muted" style={{ margin: '0 0 14px' }}>
                    Shows exactly what would be sent, without sending anything. Pick a future date to check an upcoming
                    run.
                  </p>
                  <div className="portal-entity-form">
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Run date</span>
                        <input
                          type="date"
                          value={previewDate}
                          onChange={(event) => setPreviewDate(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Project</span>
                        <select value={previewProject} onChange={(event) => setPreviewProject(event.target.value)}>
                          <option value="">All projects</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.code} — {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          className="portal-inline-btn"
                          disabled={previewLoading}
                          onClick={() => void onRunPreview()}
                        >
                          {previewLoading ? 'Checking...' : 'Run preview'}
                        </button>
                        {canTrigger && previewItems?.length ? (
                          <button type="button" className="portal-primary-btn" onClick={() => void onSendNow()}>
                            Send all now
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>

                <article className="portal-card">
                  {previewItems === null ? (
                    <div className="portal-empty-state">Run a preview to see what would be sent.</div>
                  ) : previewItems.length === 0 ? (
                    <div className="portal-empty-state">
                      Nothing due on this date. No reminders would be sent.
                    </div>
                  ) : (
                    <div className="portal-list-stack">
                      {previewItems.map((item, index) => (
                        <div key={`${item.ruleId}-${item.targetId}-${index}`} className="portal-list-row">
                          <div>
                            <strong>{item.customerName}</strong>
                            <p>
                              {item.description} · due {formatDate(item.dueDate)} · {item.ruleName}
                            </p>
                            {item.smsBody ? (
                              <p className="portal-muted" style={{ marginTop: 6 }}>
                                “{item.smsBody}”
                              </p>
                            ) : null}
                            {item.skipReason ? <p className="portal-error">{item.skipReason}</p> : null}
                          </div>
                          <span>{formatMoney(item.amountOutstanding, item.currency)}</span>
                          <span>{item.channel}</span>
                          {canTrigger && !item.skipReason ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onSendSingle(item)}>
                              Send
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </>
            ) : null}

            {view === 'logs' ? (
              <article className="portal-card" data-tour="reminders.log">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Delivery log</h2>
                  <button type="button" className="portal-inline-btn" onClick={() => logsPager.reload()}>
                    Refresh
                  </button>
                </div>
                <div className="portal-entity-form" style={{ margin: '12px 0' }}>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Status</span>
                      <select
                        value={logStatus}
                        onChange={(event) => setLogStatus(event.target.value as DispatchStatus | '')}
                      >
                        <option value="">All statuses</option>
                        {(Object.keys(STATUS_LABELS) as DispatchStatus[]).map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Type</span>
                      <select value={logTarget} onChange={(event) => setLogTarget(event.target.value as TargetType | '')}>
                        <option value="">All types</option>
                        {TARGET_ORDER.map((target) => (
                          <option key={target} value={target}>
                            {TARGET_LABELS[target]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="list-toolbar">
                  <ServerListSearch pager={logsPager} placeholder="Search delivery log…" />
                    <ListExport
                      rows={logExportRows}
                      config={{
                        fileName: 'reminder-delivery-log',
                        dateOf: (row) => row.dueDate,
                        dateLabel: 'Due',
                        columns: [
                          { header: 'Target Type', value: (row) => row.targetType },
                          { header: 'Channel', value: (row) => row.channel },
                          { header: 'Status', value: (row) => row.status },
                          { header: 'Recipient Phone', value: (row) => row.recipientPhone || '' },
                          { header: 'Recipient Email', value: (row) => row.recipientEmail || '' },
                          { header: 'Due', value: (row) => formatDate(row.dueDate) },
                        ],
                      }}
                    />
                </div>
                <div className="portal-list-stack">
                  {!logsPager.loading && logsPager.items.length === 0 ? (
                    <div className="portal-empty-state">
                      {logsPager.search ? 'No log entries match.' : 'No reminders have been sent yet.'}
                    </div>
                  ) : (
                    logsPager.items.map((log) => (
                      <div key={log.id} className="portal-list-row">
                        <div>
                          <strong>{log.rule?.name || 'Deleted rule'}</strong>
                          <p>
                            {TARGET_LABELS[log.targetType]} · due {formatDate(log.dueDate)} ·{' '}
                            {log.recipientPhone || log.recipientEmail || 'no contact'}
                            {log.isManual ? ` · manual${log.triggeredBy ? ` by ${log.triggeredBy}` : ''}` : ''}
                          </p>
                          {log.statusReason ? <p className="portal-error">{log.statusReason}</p> : null}
                        </div>
                        <span>{log.amount ? formatMoney(log.amount, log.currency || 'KES') : ''}</span>
                        <span className={`portal-chip ${STATUS_CHIP[log.status]}`}>
                          {STATUS_LABELS[log.status]}
                        </span>
                        <span>{formatDate(log.sentAt || log.createdAt)}</span>
                      </div>
                    ))
                  )}
                </div>
                <ServerListPager pager={logsPager} noun="entries" />
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
