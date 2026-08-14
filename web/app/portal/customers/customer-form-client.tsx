"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { useRouter } from 'next/navigation';
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import {
  emptyNextOfKinForm,
  NextOfKin,
  NextOfKinFormProps,
  serializeNextOfKinList,
  toNextOfKinFormList,
  totalNextOfKinOwnership,
} from './next-of-kin';

export const DOCUMENT_TYPES = [
  { value: 'NATIONAL_ID', label: 'National ID' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'KRA_PIN', label: 'KRA PIN' },
  { value: 'PROOF_OF_ADDRESS', label: 'Proof of Address' },
  { value: 'BANK_STATEMENT', label: 'Bank Statement' },
  { value: 'SALE_CONTRACT', label: 'Sale Contract' },
  { value: 'LEASE_AGREEMENT', label: 'Lease Agreement' },
  { value: 'NEXT_OF_KIN_ID', label: 'Next of Kin ID' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'OTHER', label: 'Other' },
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number]['value'];

type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalIdPassport: string;
  kraPin?: string | null;
  nextOfKinJson?: NextOfKin | NextOfKin[] | { contacts?: NextOfKin[] } | null;
};

type CustomerDocument = {
  id: string;
  customerId: string;
  documentType: DocumentType | string;
  fileName: string;
  objectKey: string;
  url: string;
  contentType?: string | null;
  fileSize?: number | null;
  notes?: string | null;
  uploadedAt: string;
};

type CustomerFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalIdPassport: string;
  kraPin: string;
};

type StagedDocument = {
  localId: string;
  file: File;
  documentType: DocumentType;
  notes: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'drl_access_token';

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function uploadMedia(file: File, token: string) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || 'Upload failed');
  }

  return (await response.json()) as {
    objectKey: string;
    url: string;
    contentType?: string;
    fileName?: string;
  };
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string) {
  if (!profile) return false;
  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) return true;
  return Boolean(profile.permissions?.includes(permission));
}

function documentTypeLabel(value: string) {
  return DOCUMENT_TYPES.find((item) => item.value === value)?.label || value.replaceAll('_', ' ');
}

function formatBytes(size?: number | null) {
  if (!size || size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function makeForm(customer?: Customer): CustomerFormState {
  return {
    firstName: customer?.firstName || '',
    lastName: customer?.lastName || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    nationalIdPassport: customer?.nationalIdPassport || '',
    kraPin: customer?.kraPin || '',
  };
}

export default function CustomerFormClient({ mode, customerId }: { mode: 'create' | 'edit'; customerId?: string }) {
  const dialog = usePortalDialog();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [form, setForm] = useState<CustomerFormState>(makeForm());
  const [nextOfKinForms, setNextOfKinForms] = useState<NextOfKinFormProps[]>([emptyNextOfKinForm('100')]);
  const [existingDocuments, setExistingDocuments] = useState<CustomerDocument[]>([]);
  const [stagedDocuments, setStagedDocuments] = useState<StagedDocument[]>([]);
  const [defaultDocumentType, setDefaultDocumentType] = useState<DocumentType>('NATIONAL_ID');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      setProfile(nextProfile);

      if (mode === 'edit' && customerId) {
        const [customer, documents] = await Promise.all([
          apiRequest<Customer>(`/customers/${customerId}`, { method: 'GET' }, authToken),
          hasPermission(nextProfile, 'customer-document.read')
            ? apiRequest<CustomerDocument[]>(
                `/customer-documents?customerId=${customerId}&take=200`,
                { method: 'GET' },
                authToken,
              )
            : Promise.resolve([]),
        ]);
        setForm(makeForm(customer));
        setNextOfKinForms(toNextOfKinFormList(customer.nextOfKinJson));
        setExistingDocuments(documents);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load customer form.');
    } finally {
      setLoading(false);
    }
  }, [mode, customerId]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canCreate = hasPermission(profile, 'customer.create');
  const canUpdate = hasPermission(profile, 'customer.update');
  const canManageDocs =
    hasPermission(profile, 'customer-document.create') || hasPermission(profile, 'customer-document.update');
  const canDeleteDocs = hasPermission(profile, 'customer-document.delete');
  const canSubmit = mode === 'create' ? canCreate : canUpdate;

  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;

    setStagedDocuments((prev) => [
      ...prev,
      ...files.map((file) => ({
        localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        documentType: defaultDocumentType,
        notes: '',
      })),
    ]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  }

  async function persistDocuments(authToken: string, targetCustomerId: string, docs: StagedDocument[]) {
    for (const doc of docs) {
      const uploaded = await uploadMedia(doc.file, authToken);
      await apiRequest(
        '/customer-documents',
        {
          method: 'POST',
          body: JSON.stringify({
            customerId: targetCustomerId,
            documentType: doc.documentType,
            fileName: doc.file.name,
            objectKey: uploaded.objectKey,
            url: uploaded.url,
            contentType: uploaded.contentType || doc.file.type || undefined,
            fileSize: doc.file.size,
            notes: doc.notes || undefined,
          }),
        },
        authToken,
      );
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSubmit) return;

    setSaving(true);
    setErrorMessage(null);
    setFeedback(null);

    const namedKin = nextOfKinForms.filter((entry) => entry.name.trim());
    const kinTotal = totalNextOfKinOwnership(namedKin);
    if (kinTotal > 100.0001) {
      setErrorMessage(`Next of kin ownership percentages total ${kinTotal.toFixed(1)}% and cannot exceed 100%.`);
      setSaving(false);
      return;
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      nationalIdPassport: form.nationalIdPassport.trim(),
      kraPin: form.kraPin.trim() || undefined,
      nextOfKinJson: serializeNextOfKinList(nextOfKinForms),
    };

    try {
      let savedId = customerId;

      if (mode === 'create') {
        const created = await apiRequest<Customer>(
          '/customers',
          { method: 'POST', body: JSON.stringify(payload) },
          token,
        );
        savedId = created.id;
      } else if (customerId) {
        await apiRequest(`/customers/${customerId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
      }

      if (savedId && stagedDocuments.length > 0 && canManageDocs) {
        await persistDocuments(token, savedId, stagedDocuments);
      }

      setFeedback(mode === 'create' ? 'Customer created.' : 'Customer updated.');
      router.push(savedId ? `/portal/customers/${savedId}` : '/portal/customers');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save customer.');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteExistingDocument(id: string) {
    if (!token || !canDeleteDocs) return;
    const confirmed = await dialog.confirm({
      title: 'Remove Document',
      message: 'Remove this document?',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/customer-documents/${id}`, { method: 'DELETE' }, token);
      setExistingDocuments((prev) => prev.filter((doc) => doc.id !== id));
      setFeedback('Document removed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete document.');
    }
  }

  async function onUpdateExistingDocumentType(id: string, documentType: DocumentType) {
    if (!token || !hasPermission(profile, 'customer-document.update')) return;

    try {
      const updated = await apiRequest<CustomerDocument>(
        `/customer-documents/${id}`,
        { method: 'PATCH', body: JSON.stringify({ documentType }) },
        token,
      );
      setExistingDocuments((prev) => prev.map((doc) => (doc.id === id ? updated : doc)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update document type.');
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading customer form...</article>
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

  if (!canSubmit) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="customers"
              pageTitle={mode === 'create' ? 'Create Customer' : 'Edit Customer'}
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={hasPermission(profile, 'role.read')}
              onLogout={onLogout}
            >
              <article className="portal-card portal-role-banner">
                You do not have permission to {mode === 'create' ? 'create' : 'update'} customers.
              </article>
              <Link href="/portal/customers" className="portal-ghost-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Back to Customers
              </Link>
            </PortalShell>
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
            active="customers"
            pageTitle={mode === 'create' ? 'Create Customer' : 'Edit Customer'}
            pageSubtitle={
              mode === 'create'
                ? 'Add customer details and attach tagged supporting documents.'
                : 'Update customer details and manage document attachments.'
            }
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={
              hasPermission(profile, 'role.read') ||
              hasPermission(profile, 'permission.read') ||
              hasPermission(profile, 'user.read')
            }
            onLogout={onLogout}
          >

            <form className="portal-stack-grid" onSubmit={onSubmit}>
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Customer Details</h2>
                  <Link href="/portal/customers" className="portal-inline-btn">
                    Cancel
                  </Link>
                </div>

                <div className="portal-entity-form">
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>First Name</span>
                      <input
                        value={form.firstName}
                        onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Last Name</span>
                      <input
                        value={form.lastName}
                        onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                  </label>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Phone</span>
                      <input
                        value={form.phone}
                        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>National ID / Passport</span>
                      <input
                        value={form.nationalIdPassport}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, nationalIdPassport: event.target.value }))
                        }
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>KRA PIN (Optional)</span>
                    <input
                      value={form.kraPin}
                      onChange={(event) => setForm((prev) => ({ ...prev, kraPin: event.target.value }))}
                    />
                  </label>
                </div>
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Next of Kin</h2>
                    <p className="portal-kin-total" style={{ marginTop: 8 }}>
                      Allocated ownership share:{' '}
                      <strong>
                        {totalNextOfKinOwnership(nextOfKinForms.filter((entry) => entry.name.trim())).toFixed(1)}%
                      </strong>
                      {' '}(must not exceed 100%)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="portal-inline-btn"
                    onClick={() => setNextOfKinForms((prev) => [...prev, emptyNextOfKinForm('0')])}
                  >
                    Add Next of Kin
                  </button>
                </div>

                <div className="portal-list-stack">
                  {nextOfKinForms.map((entry, index) => (
                    <div key={`form-kin-${index}`} className="portal-kin-card">
                      <div className="portal-card-header-row">
                        <strong>Next of kin {index + 1}</strong>
                        {nextOfKinForms.length > 1 ? (
                          <button
                            type="button"
                            className="portal-inline-btn is-danger"
                            onClick={() =>
                              setNextOfKinForms((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="portal-entity-form">
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Name</span>
                            <input
                              value={entry.name}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, name: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Ownership %</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={entry.ownershipPercentage}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, ownershipPercentage: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Relationship</span>
                            <input
                              value={entry.relationship}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, relationship: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Phone</span>
                            <input
                              value={entry.phone}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, phone: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Email</span>
                            <input
                              type="email"
                              value={entry.email}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, email: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Documents</h2>
                  <label className="portal-inline-type-select">
                    <span>Default type for new files</span>
                    <select
                      value={defaultDocumentType}
                      onChange={(event) => setDefaultDocumentType(event.target.value as DocumentType)}
                    >
                      {DOCUMENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div
                  className={`portal-dropzone${dragging ? ' is-dragging' : ''}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragging(false);
                  }}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <strong>Drag & drop documents here</strong>
                  <p>or click to browse. Tag each file with a document type before saving.</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        addFiles(event.target.files);
                        event.target.value = '';
                      }
                    }}
                  />
                </div>

                {stagedDocuments.length > 0 ? (
                  <>
                    <h3 className="portal-subsection-title">Ready to upload</h3>
                    <div className="portal-list-stack">
                      {stagedDocuments.map((doc) => (
                        <div key={doc.localId} className="portal-record portal-document-row">
                          <div className="portal-list-row">
                            <div>
                              <strong>{doc.file.name}</strong>
                              <p>
                                {formatBytes(doc.file.size)} • {doc.file.type || 'unknown type'}
                              </p>
                            </div>
                            <span>NEW</span>
                            <span>{documentTypeLabel(doc.documentType)}</span>
                          </div>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Document Type</span>
                              <select
                                value={doc.documentType}
                                onChange={(event) =>
                                  setStagedDocuments((prev) =>
                                    prev.map((item) =>
                                      item.localId === doc.localId
                                        ? { ...item, documentType: event.target.value as DocumentType }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                {DOCUMENT_TYPES.map((type) => (
                                  <option key={type.value} value={type.value}>
                                    {type.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Notes</span>
                              <input
                                value={doc.notes}
                                onChange={(event) =>
                                  setStagedDocuments((prev) =>
                                    prev.map((item) =>
                                      item.localId === doc.localId ? { ...item, notes: event.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="Optional"
                              />
                            </label>
                          </div>
                          <div className="portal-action-row">
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() =>
                                setStagedDocuments((prev) => prev.filter((item) => item.localId !== doc.localId))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                {mode === 'edit' ? (
                  <>
                    <h3 className="portal-subsection-title">Saved documents</h3>
                    <div className="portal-list-stack">
                      {existingDocuments.length === 0 ? (
                        <div className="portal-empty-state">No documents attached yet.</div>
                      ) : (
                        existingDocuments.map((doc) => (
                          <div key={doc.id} className="portal-record portal-document-row">
                            <div className="portal-list-row">
                              <div>
                                <strong>
                                  <a href={doc.url} target="_blank" rel="noreferrer">
                                    {doc.fileName}
                                  </a>
                                </strong>
                                <p>
                                  {formatBytes(doc.fileSize)} • uploaded{' '}
                                  {new Date(doc.uploadedAt).toLocaleDateString('en-GB')}
                                  {doc.notes ? ` • ${doc.notes}` : ''}
                                </p>
                              </div>
                              <span>{documentTypeLabel(doc.documentType)}</span>
                              <span>SAVED</span>
                            </div>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Document Type</span>
                                <select
                                  value={doc.documentType}
                                  onChange={(event) =>
                                    void onUpdateExistingDocumentType(doc.id, event.target.value as DocumentType)
                                  }
                                  disabled={!hasPermission(profile, 'customer-document.update')}
                                >
                                  {DOCUMENT_TYPES.map((type) => (
                                    <option key={type.value} value={type.value}>
                                      {type.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="portal-action-row" style={{ alignItems: 'end' }}>
                                <a href={doc.url} target="_blank" rel="noreferrer" className="portal-inline-btn">
                                  Open
                                </a>
                                {canDeleteDocs ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    onClick={() => void onDeleteExistingDocument(doc.id)}
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
                  </>
                ) : null}
              </article>

              <div className="portal-inline-actions">
                <button type="submit" className="portal-primary-btn" disabled={saving}>
                  {saving
                    ? 'Saving...'
                    : mode === 'create'
                      ? stagedDocuments.length
                        ? `Create Customer & Upload ${stagedDocuments.length} File${stagedDocuments.length === 1 ? '' : 's'}`
                        : 'Create Customer'
                      : stagedDocuments.length
                        ? `Save & Upload ${stagedDocuments.length} File${stagedDocuments.length === 1 ? '' : 's'}`
                        : 'Save Changes'}
                </button>
                <Link href="/portal/customers" className="portal-ghost-btn">
                  Back to List
                </Link>
              </div>
            </form>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
