"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { formatArea } from '../../../lib/area';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { usePortalDialog } from '../../components/portal-dialog';
import UnitRentalPanel, {
  CollectionsReport,
  ReminderPreviewItem,
  RentalPayment,
  RentChangeRequest,
  Tenancy,
  UtilityCharge,
} from './unit-rental-panel';

type Unit = {
  id: string;
  blockId: string;
  unitNumber: string;
  floorNumber: number;
  sizeSqm: string | number;
  priceKes: string | number;
  priceUsd: string | number;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RENTED' | 'BLOCKED';
  bedrooms: number;
  parkingSlots: number;
  hasBalcony: boolean;
  hasStore: boolean;
  featuredImageUrl?: string | null;
  galleryImages?: string[] | null;
  floorPlanUrl?: string | null;
  version: number;
  createdAt?: string;
};

type ProjectBlock = {
  id: string;
  projectId: string;
  blockName: string;
  totalFloors: number;
  units?: Array<{ id: string; unitNumber: string }>;
};

type Project = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  blocks?: ProjectBlock[];
};

type Amenity = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: string | null;
};

type UnitAmenityLink = {
  id: string;
  unitId: string;
  amenityId: string;
  amenity: Amenity;
};

type NextOfKin = {
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalIdPassport?: string;
  kraPin?: string | null;
  nextOfKinJson?: NextOfKin | null;
};

type UnitOwnership = {
  id: string;
  unitId: string;
  customerId: string;
  ownershipPercentage: string | number;
  isPrimaryOwner: boolean;
  acquiredAt?: string;
  transferredAt?: string | null;
};

type SalesContract = {
  id: string;
  contractNumber: string;
  unitId: string;
  primaryCustomerId: string;
  currency: string;
  totalAgreedPrice: string | number;
  contractStatus: string;
  createdAt?: string;
};

type CustomerPayment = {
  id: string;
  receiptNumber: string;
  contractId: string;
  amountPaid: string | number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: string;
};

type OwnershipChangeAudit = {
  id: string;
  unitId: string;
  ownershipId?: string | null;
  action: 'ASSIGNED' | 'REASSIGNED' | 'UPDATED' | 'REMOVED';
  fromCustomerId?: string | null;
  toCustomerId?: string | null;
  fromPercentage?: string | number | null;
  toPercentage?: string | number | null;
  fromIsPrimary?: boolean | null;
  toIsPrimary?: boolean | null;
  reason?: string | null;
  changedBy: string;
  timestamp: string;
};

type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  name?: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

type OwnershipForm = {
  customerId: string;
  ownershipPercentage: string;
  isPrimaryOwner: boolean;
};

type PaymentForm = {
  receiptNumber: string;
  contractId: string;
  amountPaid: string;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: string;
};

type ContractForm = {
  contractNumber: string;
  primaryCustomerId: string;
  currency: string;
  totalAgreedPrice: string;
  contractStatus: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'drl_access_token';

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

async function downloadFile(path: string, token: string, fallbackFileName: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `Download failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const fileName = match ? match[1] : fallbackFileName;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string): boolean {
  if (!profile) {
    return false;
  }

  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) {
    return true;
  }

  return Boolean(profile.permissions?.includes(permission));
}

function formatMoney(value: string | number, currency: string) {
  const numericValue = Number(value || 0);
  if (Number.isNaN(numericValue)) {
    return `${currency} 0.00`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function customerLabel(customer?: Customer | null) {
  if (!customer) {
    return 'Unknown customer';
  }

  return `${customer.firstName} ${customer.lastName}`;
}

function makeOwnershipForm(ownership?: UnitOwnership): OwnershipForm {
  return {
    customerId: ownership?.customerId || '',
    ownershipPercentage: ownership ? String(ownership.ownershipPercentage) : '100',
    isPrimaryOwner: ownership?.isPrimaryOwner ?? true,
  };
}

function makePaymentForm(payment?: CustomerPayment, defaultContractId = ''): PaymentForm {
  return {
    receiptNumber: payment?.receiptNumber || '',
    contractId: payment?.contractId || defaultContractId,
    amountPaid: payment ? String(payment.amountPaid) : '',
    currency: payment?.currency || 'KES',
    paymentMethod: payment?.paymentMethod || 'BANK_TRANSFER',
    transactionReference: payment?.transactionReference || '',
    paymentDate: payment?.paymentDate ? payment.paymentDate.slice(0, 10) : '',
  };
}

function makeContractForm(unit?: Unit | null, defaultCustomerId = ''): ContractForm {
  return {
    contractNumber: '',
    primaryCustomerId: defaultCustomerId,
    currency: 'KES',
    totalAgreedPrice: unit ? String(unit.priceKes) : '',
    contractStatus: 'ACTIVE',
  };
}

export default function UnitDetailClient({ unitId }: { unitId: string }) {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ownerships, setOwnerships] = useState<UnitOwnership[]>([]);
  const [ownershipAudits, setOwnershipAudits] = useState<OwnershipChangeAudit[]>([]);
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [utilityCharges, setUtilityCharges] = useState<UtilityCharge[]>([]);
  const [rentChangeRequests, setRentChangeRequests] = useState<RentChangeRequest[]>([]);
  const [reminderPreview, setReminderPreview] = useState<ReminderPreviewItem[] | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderSendingId, setReminderSendingId] = useState<string | null>(null);
  const [rentalPayments, setRentalPayments] = useState<RentalPayment[]>([]);
  const [collections, setCollections] = useState<CollectionsReport | null>(null);
  const [collectionsFrom, setCollectionsFrom] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [collectionsTo, setCollectionsTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [assignForm, setAssignForm] = useState<OwnershipForm>(makeOwnershipForm());
  const [editingOwnershipId, setEditingOwnershipId] = useState<string | null>(null);
  const [ownershipEditForm, setOwnershipEditForm] = useState<OwnershipForm>(makeOwnershipForm());

  const [paymentForm, setPaymentForm] = useState<PaymentForm>(makePaymentForm());
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState<PaymentForm>(makePaymentForm());

  const [contractForm, setContractForm] = useState<ContractForm>(makeContractForm());
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);

  const [allAmenities, setAllAmenities] = useState<Amenity[]>([]);
  const [unitAmenities, setUnitAmenities] = useState<UnitAmenityLink[]>([]);
  const [unitAmenityToAdd, setUnitAmenityToAdd] = useState('');
  const [unitAmenitiesMutating, setUnitAmenitiesMutating] = useState(false);
  const [unitAmenitiesError, setUnitAmenitiesError] = useState<string | null>(null);

  const loadUnitAmenities = useCallback(async (authToken: string) => {
    setUnitAmenitiesError(null);
    try {
      const [catalog, linked] = await Promise.all([
        hasPermission(profile, 'amenity.read') ? apiRequest<Amenity[]>('/amenities', { method: 'GET' }, authToken) : Promise.resolve([]),
        hasPermission(profile, 'amenity.read')
          ? apiRequest<UnitAmenityLink[]>(`/units/${unitId}/amenities`, { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setAllAmenities(catalog);
      setUnitAmenities(linked);
    } catch (error) {
      setUnitAmenitiesError(error instanceof Error ? error.message : 'Unable to load amenities.');
    }
  }, [profile, unitId]);

  useEffect(() => {
    if (token) void loadUnitAmenities(token);
  }, [token, loadUnitAmenities]);

  async function onAttachUnitAmenity() {
    if (!token || !unitAmenityToAdd) return;
    setUnitAmenitiesMutating(true);
    setUnitAmenitiesError(null);
    try {
      await apiRequest(`/units/${unitId}/amenities/${unitAmenityToAdd}`, { method: 'POST' }, token);
      setUnitAmenityToAdd('');
      await loadUnitAmenities(token);
    } catch (error) {
      setUnitAmenitiesError(error instanceof Error ? error.message : 'Unable to attach amenity.');
    } finally {
      setUnitAmenitiesMutating(false);
    }
  }

  async function onDetachUnitAmenity(amenityId: string) {
    if (!token) return;
    setUnitAmenitiesMutating(true);
    setUnitAmenitiesError(null);
    try {
      await apiRequest(`/units/${unitId}/amenities/${amenityId}`, { method: 'DELETE' }, token);
      await loadUnitAmenities(token);
    } catch (error) {
      setUnitAmenitiesError(error instanceof Error ? error.message : 'Unable to remove amenity.');
    } finally {
      setUnitAmenitiesMutating(false);
    }
  }

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    setToken(savedToken);
    setInitialized(true);
  }, []);

  const loadUnit = useCallback(async (authToken: string, range?: { from: string; to: string }) => {
    setLoading(true);
    setErrorMessage(null);

    const from = range?.from || collectionsFrom;
    const to = range?.to || collectionsTo;

    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);

      const [
        nextUnit,
        nextProjects,
        nextOwnerships,
        nextOwnershipAudits,
        nextContracts,
        nextPayments,
        nextCustomers,
        nextTenancies,
        nextRentalPayments,
        nextCollections,
      ] = await Promise.all([
        apiRequest<Unit>(`/units/${unitId}`, { method: 'GET' }, authToken),
        hasPermission(nextProfile, 'project.read')
          ? apiRequest<Project[]>('/projects?include=blocks,blocks.units', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'unit-ownership.read')
          ? apiRequest<UnitOwnership[]>('/unit-ownerships?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'ownership-change-audit.read')
          ? apiRequest<OwnershipChangeAudit[]>(
              `/ownership-change-audits?unitId=${unitId}&take=200`,
              { method: 'GET' },
              authToken,
            )
          : Promise.resolve([]),
        hasPermission(nextProfile, 'sales-contract.read')
          ? apiRequest<SalesContract[]>('/sales-contracts?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'customer-payment.read')
          ? apiRequest<CustomerPayment[]>('/customer-payments?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'customer.read')
          ? apiRequest<Customer[]>('/customers?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'tenancy.read')
          ? apiRequest<Tenancy[]>(`/tenancies?unitId=${unitId}&take=200`, { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'rental-payment.read')
          ? apiRequest<RentalPayment[]>(
              `/rental-payments?unitId=${unitId}&take=500`,
              { method: 'GET' },
              authToken,
            )
          : Promise.resolve([]),
        hasPermission(nextProfile, 'rental-payment.read')
          ? apiRequest<CollectionsReport>(
              `/rental-payments/collections?unitId=${unitId}&from=${from}&to=${to}&currency=KES`,
              { method: 'GET' },
              authToken,
            )
          : Promise.resolve(null),
      ]);

      setProfile(nextProfile);
      setUnit(nextUnit);
      setProjects(nextProjects);
      setOwnerships(nextOwnerships);
      setOwnershipAudits(nextOwnershipAudits);
      setContracts(nextContracts);
      setPayments(nextPayments);
      setCustomers(nextCustomers);
      setTenancies(nextTenancies);
      setRentalPayments(nextRentalPayments);
      setCollections(nextCollections);

      if (hasPermission(nextProfile, 'tenancy.read')) {
        try {
          setRentChangeRequests(
            await apiRequest<RentChangeRequest[]>(
              `/tenancies/rent-change-requests?unitId=${unitId}`,
              { method: 'GET' },
              authToken,
            ),
          );
        } catch {
          setRentChangeRequests([]);
        }
      }

      // Charges hang off a tenancy id, so this can only run once the tenancies
      // are known. A failure here must not blank out the rest of the page.
      const activeTenancy =
        nextTenancies.find((item) => item.status === 'ACTIVE') || nextTenancies[0] || null;
      if (activeTenancy) {
        try {
          setUtilityCharges(
            await apiRequest<UtilityCharge[]>(
              `/tenancies/${activeTenancy.id}/utility-charges`,
              { method: 'GET' },
              authToken,
            ),
          );
        } catch {
          setUtilityCharges([]);
        }
      } else {
        setUtilityCharges([]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load unit details.');
    } finally {
      setLoading(false);
    }
  }, [unitId, collectionsFrom, collectionsTo]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!token) {
      setLoading(false);
      return;
    }

    void loadUnit(token);
  }, [initialized, token, loadUnit]);

  const unitContext = useMemo(() => {
    if (!unit) {
      return null;
    }

    for (const project of projects) {
      for (const block of project.blocks || []) {
        if (block.id === unit.blockId || (block.units || []).some((blockUnit) => blockUnit.id === unit.id)) {
          return { project, block };
        }
      }
    }

    return null;
  }, [projects, unit]);

  const matchedOwnerships = useMemo(
    () => ownerships.filter((ownership) => ownership.unitId === unitId),
    [ownerships, unitId],
  );

  const matchedContracts = useMemo(
    () => contracts.filter((contract) => contract.unitId === unitId),
    [contracts, unitId],
  );

  const contractIds = useMemo(() => new Set(matchedContracts.map((contract) => contract.id)), [matchedContracts]);

  const matchedPayments = useMemo(
    () =>
      payments
        .filter((payment) => contractIds.has(payment.contractId))
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
    [payments, contractIds],
  );

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers]);

  const paymentSummary = useMemo(() => {
    const totalsByCurrency = matchedContracts.reduce<Record<string, { agreed: number; paid: number }>>((acc, contract) => {
      const currency = contract.currency || 'KES';
      if (!acc[currency]) {
        acc[currency] = { agreed: 0, paid: 0 };
      }
      acc[currency].agreed += Number(contract.totalAgreedPrice || 0);
      return acc;
    }, {});

    for (const payment of matchedPayments) {
      const currency = payment.currency || 'KES';
      if (!totalsByCurrency[currency]) {
        totalsByCurrency[currency] = { agreed: 0, paid: 0 };
      }
      totalsByCurrency[currency].paid += Number(payment.amountPaid || 0);
    }

    const primaryCurrency =
      matchedContracts[0]?.currency ||
      matchedPayments[0]?.currency ||
      'KES';

    const primary = totalsByCurrency[primaryCurrency] || { agreed: 0, paid: 0 };
    const agreed = primary.agreed > 0 ? primary.agreed : Number(unit?.priceKes || 0);
    const paid = primary.paid;
    const balance = Math.max(agreed - paid, 0);
    const percentPaid = agreed > 0 ? Math.min((paid / agreed) * 100, 100) : paid > 0 ? 100 : 0;

    return {
      currency: primaryCurrency,
      agreed,
      paid,
      balance,
      percentPaid,
      totalsByCurrency,
    };
  }, [matchedContracts, matchedPayments, unit]);

  const totalOwnership = useMemo(
    () => matchedOwnerships.reduce((sum, ownership) => sum + Number(ownership.ownershipPercentage || 0), 0),
    [matchedOwnerships],
  );

  const canAssignOwner = hasPermission(profile, 'unit-ownership.create');
  const canUpdateOwner = hasPermission(profile, 'unit-ownership.update');
  const canDeleteOwner = hasPermission(profile, 'unit-ownership.delete');
  const canCreatePayment = hasPermission(profile, 'customer-payment.create');
  const canUpdatePayment = hasPermission(profile, 'customer-payment.update');
  const canDeletePayment = hasPermission(profile, 'customer-payment.delete');
  const canCreateContract = hasPermission(profile, 'sales-contract.create');
  const canDeleteContract = hasPermission(profile, 'sales-contract.delete');
  const canCreateTenancy = hasPermission(profile, 'tenancy.create');
  const canUpdateTenancy = hasPermission(profile, 'tenancy.update');
  const canDeleteTenancy = hasPermission(profile, 'tenancy.delete');
  const canCreateRentalPayment = hasPermission(profile, 'rental-payment.create');
  const canUpdateRentalPayment = hasPermission(profile, 'rental-payment.update');
  const canDeleteRentalPayment = hasPermission(profile, 'rental-payment.delete');
  const canReadOwnershipAudits = hasPermission(profile, 'ownership-change-audit.read');
  const canUpdateUnit = hasPermission(profile, 'unit.update');
  const canPreviewReminders = hasPermission(profile, 'reminder-rule.read');
  const canSendReminders = hasPermission(profile, 'reminder-log.create');

  const activeTenancy = useMemo(
    () => tenancies.find((item) => item.status === 'ACTIVE') || null,
    [tenancies],
  );

  /**
   * Dry run scoped to this unit's tenancy. ignoreTiming is on so an operator can
   * see everything outstanding, not just what today's schedule would send.
   */
  async function reviewRentChange(id: string, status: 'APPROVED' | 'REJECTED') {
    if (!token || !canUpdateTenancy) return;

    const confirmed = await dialog.confirm({
      title: status === 'APPROVED' ? 'Approve rent change' : 'Reject rent change',
      message:
        status === 'APPROVED'
          ? 'This sets the new rent on the active tenancy straight away, changing what the tenant owes.'
          : 'The owner will see that this request was rejected.',
      confirmLabel: status === 'APPROVED' ? 'Approve' : 'Reject',
      danger: status === 'REJECTED',
    });
    if (!confirmed) return;

    await runMutation(async () => {
      await apiRequest(
        `/tenancies/rent-change-requests/${id}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        token,
      );
    }, status === 'APPROVED' ? 'Rent change approved and applied.' : 'Rent change rejected.');
  }

  async function previewReminders() {
    if (!token || !activeTenancy) return;

    setReminderLoading(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const result = await apiRequest<{ items: ReminderPreviewItem[] }>(
        `/reminders/preview?targetId=${activeTenancy.id}&ignoreTiming=true`,
        { method: 'GET' },
        token,
      );
      // Chasing a charge that is already settled would be a false alarm.
      setReminderPreview(result.items.filter((item) => item.amountOutstanding > 0));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to check outstanding charges.');
    } finally {
      setReminderLoading(false);
    }
  }

  async function sendReminder(item: ReminderPreviewItem) {
    if (!token || !canSendReminders) return;

    const confirmed = await dialog.confirm({
      title: 'Send this reminder',
      message: `Send ${item.channel} reminder to ${item.customerName} about ${item.description}?`,
      confirmLabel: 'Send',
    });
    if (!confirmed) return;

    const rowId = `${item.ruleId}:${item.targetId}`;
    setReminderSendingId(rowId);
    setErrorMessage(null);
    try {
      await apiRequest(
        '/reminders/trigger',
        {
          method: 'POST',
          body: JSON.stringify({
            ruleIds: [item.ruleId],
            // Utility target ids are composite (tenancyId:CATEGORY); the engine
            // resolves the owning tenancy from the prefix.
            targetId: item.targetId.split(':')[0],
            ignoreTiming: true,
          }),
        },
        token,
      );
      setFeedback(`Reminder queued for ${item.customerName}. Check the reminders portal for delivery.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue the reminder.');
    } finally {
      setReminderSendingId(null);
    }
  }

  async function sendAllReminders() {
    if (!token || !activeTenancy || !canSendReminders || !reminderPreview?.length) return;

    const confirmed = await dialog.confirm({
      title: 'Send all reminders',
      message: `This sends ${reminderPreview.length} reminder(s) to ${
        reminderPreview[0]?.customerName || 'the tenant'
      }. Charges already reminded today are skipped automatically.`,
      confirmLabel: 'Send',
    });
    if (!confirmed) return;

    setReminderSendingId('all');
    setErrorMessage(null);
    try {
      await apiRequest(
        '/reminders/trigger',
        {
          method: 'POST',
          body: JSON.stringify({ targetId: activeTenancy.id, ignoreTiming: true }),
        },
        token,
      );
      setFeedback('Reminder run queued. Check the reminders portal for delivery results.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue the reminders.');
    } finally {
      setReminderSendingId(null);
    }
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    if (!token) {
      return;
    }

    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);

    try {
      await action();
      setFeedback(successMessage);
      await loadUnit(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setMutating(false);
    }
  }

  async function onAssignOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canAssignOwner) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(
        '/unit-ownerships',
        {
          method: 'POST',
          body: JSON.stringify({
            unitId,
            customerId: assignForm.customerId,
            ownershipPercentage: assignForm.ownershipPercentage,
            isPrimaryOwner: assignForm.isPrimaryOwner,
            reason: 'Assigned from unit detail',
            changedBy: profile?.email || 'system',
          }),
        },
        token,
      );
      setAssignForm(makeOwnershipForm());
      setShowAssignForm(false);
    }, 'Owner assigned to unit.');
  }

  async function onUpdateOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateOwner || !editingOwnershipId) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(
        `/unit-ownerships/${editingOwnershipId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            customerId: ownershipEditForm.customerId,
            ownershipPercentage: ownershipEditForm.ownershipPercentage,
            isPrimaryOwner: ownershipEditForm.isPrimaryOwner,
            reason: 'Updated from unit detail',
            changedBy: profile?.email || 'system',
          }),
        },
        token,
      );
      setEditingOwnershipId(null);
      setOwnershipEditForm(makeOwnershipForm());
    }, 'Ownership updated.');
  }

  async function onTransferOwnership(ownership: UnitOwnership) {
    if (!token || !canUpdateOwner) return;

    const currentOwner = customerMap.get(ownership.customerId);
    const candidateCustomers = customers.filter((customer) => customer.id !== ownership.customerId);

    const result = await dialog.prompt({
      title: 'Transfer Ownership',
      message: (
        <>
          Transfer {Number(ownership.ownershipPercentage).toFixed(1)}% ownership currently held by{' '}
          <strong>{currentOwner ? customerLabel(currentOwner) : ownership.customerId}</strong> to another customer. If
          the recipient already owns a share of this unit, their existing share is increased rather than a new record
          created.
        </>
      ),
      fields: [
        {
          name: 'toCustomerId',
          label: 'Transfer To',
          type: 'select',
          required: true,
          placeholder: 'Select customer',
          options: candidateCustomers.map((customer) => ({ value: customer.id, label: `${customerLabel(customer)} (${customer.email})` })),
        },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Why is this ownership being transferred?' },
      ],
      confirmLabel: 'Transfer',
    });
    if (!result) return;

    await runMutation(async () => {
      await apiRequest(
        `/unit-ownerships/${ownership.id}/transfer`,
        {
          method: 'POST',
          body: JSON.stringify({
            toCustomerId: result.toCustomerId,
            reason: result.reason,
            changedBy: profile?.email,
          }),
        },
        token,
      );
    }, 'Ownership transferred.');
  }

  async function onDeleteOwnership(id: string) {
    if (!token || !canDeleteOwner) {
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Remove Ownership Record',
      message: 'This permanently removes this ownership record. This cannot be undone.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;

    await runMutation(async () => {
      await apiRequest(`/unit-ownerships/${id}`, { method: 'DELETE' }, token);
    }, 'Ownership removed.');
  }

  async function onCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreatePayment) {
      return;
    }

    await runMutation(async () => {
      const { receiptNumber, ...createPayload } = paymentForm;
      void receiptNumber;
      await apiRequest(
        '/customer-payments',
        {
          method: 'POST',
          body: JSON.stringify({
            ...createPayload,
            paymentDate: paymentForm.paymentDate || undefined,
          }),
        },
        token,
      );
      setPaymentForm(makePaymentForm(undefined, matchedContracts[0]?.id || ''));
      setShowPaymentForm(false);
    }, 'Payment recorded.');
  }

  async function onReallocatePayment(payment: CustomerPayment) {
    if (!token || !canUpdatePayment) return;

    const candidateContracts = contracts.filter((item) => item.id !== payment.contractId);

    const result = await dialog.prompt({
      title: 'Reallocate Payment',
      message: (
        <>
          Move payment <strong>{payment.receiptNumber}</strong> ({formatMoney(payment.amountPaid, payment.currency)})
          to a different contract. Leave amount blank to move the full payment; enter a smaller amount to split it.
        </>
      ),
      fields: [
        {
          name: 'destinationContractId',
          label: 'Move To Contract',
          type: 'select',
          required: true,
          placeholder: 'Select contract',
          options: candidateContracts.map((item) => ({ value: item.id, label: item.contractNumber })),
        },
        {
          name: 'amount',
          label: `Amount (optional — full amount is ${formatMoney(payment.amountPaid, payment.currency)})`,
          type: 'number',
        },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Why is this payment being reallocated?' },
      ],
      confirmLabel: 'Reallocate',
    });
    if (!result) return;

    await runMutation(async () => {
      await apiRequest(
        `/customer-payments/${payment.id}/reallocate`,
        {
          method: 'POST',
          body: JSON.stringify({
            destinationContractId: result.destinationContractId,
            amount: result.amount ? Number(result.amount) : undefined,
            reason: result.reason,
            reallocatedBy: profile?.email,
          }),
        },
        token,
      );
    }, 'Payment reallocated.');
  }

  async function onDownloadReceipt(payment: CustomerPayment) {
    if (!token) return;
    setDownloadingReceiptId(payment.id);
    setErrorMessage(null);
    try {
      await downloadFile(`/customer-payments/${payment.id}/pdf`, token, `receipt-${payment.receiptNumber}.pdf`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download receipt.');
    } finally {
      setDownloadingReceiptId(null);
    }
  }

  async function onUpdatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdatePayment || !editingPaymentId) {
      return;
    }

    await runMutation(async () => {
      const { receiptNumber, ...updatePayload } = paymentEditForm;
      void receiptNumber;
      await apiRequest(
        `/customer-payments/${editingPaymentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...updatePayload,
            paymentDate: paymentEditForm.paymentDate || undefined,
          }),
        },
        token,
      );
      setEditingPaymentId(null);
      setPaymentEditForm(makePaymentForm());
    }, 'Payment updated.');
  }

  async function onDeletePayment(id: string) {
    if (!token || !canDeletePayment) {
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Delete Payment',
      message: 'Delete this payment transaction? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    await runMutation(async () => {
      await apiRequest(`/customer-payments/${id}`, { method: 'DELETE' }, token);
    }, 'Payment deleted.');
  }

  async function onCreateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateContract) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(
        '/sales-contracts',
        {
          method: 'POST',
          body: JSON.stringify({
            contractNumber: contractForm.contractNumber,
            unitId,
            primaryCustomerId: contractForm.primaryCustomerId,
            currency: contractForm.currency,
            totalAgreedPrice: contractForm.totalAgreedPrice,
            contractStatus: contractForm.contractStatus,
          }),
        },
        token,
      );
      setContractForm(makeContractForm(unit));
      setShowContractForm(false);
    }, 'Sales contract created.');
  }

  async function onDeleteContract(id: string) {
    if (!token || !canDeleteContract) {
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Delete Sales Contract',
      message: 'Related payments may fail if still linked to this contract. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    await runMutation(async () => {
      await apiRequest(`/sales-contracts/${id}`, { method: 'DELETE' }, token);
    }, 'Sales contract deleted.');
  }

  async function createTenancy(payload: Record<string, unknown>) {
    if (!token || !canCreateTenancy) return;
    await runMutation(async () => {
      await apiRequest('/tenancies', { method: 'POST', body: JSON.stringify(payload) }, token);
    }, 'Tenancy created.');
  }

  async function updateTenancy(id: string, payload: Record<string, unknown>) {
    if (!token || !canUpdateTenancy) return;
    await runMutation(async () => {
      await apiRequest(`/tenancies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
    }, 'Tenancy updated.');
  }

  async function deleteTenancy(id: string) {
    if (!token || !canDeleteTenancy) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Tenancy',
      message: 'This also removes its rental payments. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/tenancies/${id}`, { method: 'DELETE' }, token);
    }, 'Tenancy deleted.');
  }

  async function createRentalPayment(payload: Record<string, unknown>) {
    if (!token || !canCreateRentalPayment) return;
    await runMutation(async () => {
      await apiRequest('/rental-payments', { method: 'POST', body: JSON.stringify(payload) }, token);
    }, 'Rental payment recorded.');
  }

  async function updateRentalPayment(id: string, payload: Record<string, unknown>) {
    if (!token || !canUpdateRentalPayment) return;
    await runMutation(async () => {
      await apiRequest(`/rental-payments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
    }, 'Rental payment updated.');
  }

  async function deleteRentalPayment(id: string) {
    if (!token || !canDeleteRentalPayment) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Rental Payment',
      message: 'Delete this rental/utility payment? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/rental-payments/${id}`, { method: 'DELETE' }, token);
    }, 'Rental payment deleted.');
  }

  async function loadCollectionsOnly() {
    if (!token || !hasPermission(profile, 'rental-payment.read')) return;
    setMutating(true);
    setErrorMessage(null);
    try {
      const nextCollections = await apiRequest<CollectionsReport>(
        `/rental-payments/collections?unitId=${unitId}&from=${collectionsFrom}&to=${collectionsTo}&currency=KES`,
        { method: 'GET' },
        token,
      );
      setCollections(nextCollections);
      setFeedback('Collections refreshed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load collections.');
    } finally {
      setMutating(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Elite Estate Control Center</p>
            <h1>Loading unit details...</h1>
            <p>Fetching ownership, contracts, and payment history.</p>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Elite Estate Control Center</p>
            <h1>Authentication required</h1>
            <p>This unit is only visible after you sign in to the portal.</p>
            <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
              Go to Portal Login
            </Link>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (errorMessage && !unit) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Elite Estate Control Center</p>
            <h1>Unit not available</h1>
            <p>{errorMessage}</p>
            <Link href="/portal/units" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
              Back to Units
            </Link>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!unit) {
    return null;
  }

  const primaryOwner = matchedOwnerships.find((ownership) => ownership.isPrimaryOwner) || matchedOwnerships[0];
  const primaryOwnerCustomer = primaryOwner ? customerMap.get(primaryOwner.customerId) : null;
  const roleLabel =
    profile.roles && profile.roles.length > 0
      ? profile.roles.map((role) => role.name).join(', ')
      : profile.role || 'Unassigned';
  const canReadRbac =
    hasPermission(profile, 'role.read') ||
    hasPermission(profile, 'permission.read') ||
    hasPermission(profile, 'user.read');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="units"
            pageTitle={unit.unitNumber}
            pageSubtitle={
              unitContext
                ? `${unitContext.project.code} • ${unitContext.project.name} • Block ${unitContext.block.blockName}`
                : 'Unit details from the live portfolio database.'
            }
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbac}
            onLogout={onLogout}
          >
          <div className="portal-detail-header" style={{ marginBottom: 0, paddingBottom: 0, border: 0 }}>
            <div>
              <div className="portal-detail-meta">
                <span>{unit.status}</span>
                <span>Floor {unit.floorNumber}</span>
                <span>{unit.bedrooms} bed</span>
                <span>{formatArea(unit.sizeSqm)}</span>
              </div>
            </div>
            <div className="portal-detail-header-actions">
              <Link href="/portal/units" className="portal-ghost-btn portal-detail-back">
                Back to Units
              </Link>
              {unitContext ? (
                <Link href={`/portal/projects/${unitContext.project.id}`} className="portal-inline-btn">
                  View Project
                </Link>
              ) : null}
              {canUpdateUnit ? (
                <Link href={`/portal/units/${unitId}/edit`} className="portal-inline-btn">
                  Edit Unit
                </Link>
              ) : null}
            </div>
          </div>


          <div className="portal-stack-grid">
            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Photos &amp; Floor Plan</h2>
                {canUpdateUnit ? (
                  <Link href={`/portal/units/${unitId}/edit`} className="portal-inline-btn">
                    Manage Photos
                  </Link>
                ) : null}
              </div>

              {unit.featuredImageUrl ? (
                <div className="portal-featured-preview">
                  <div className="portal-featured-preview-label">Featured photo</div>
                  <img src={unit.featuredImageUrl} alt={`${unit.unitNumber} featured`} />
                </div>
              ) : (
                <div className="portal-empty-state">No featured photo uploaded yet.</div>
              )}

              {unit.galleryImages && unit.galleryImages.length > 0 ? (
                <div className="portal-project-gallery-grid" style={{ marginTop: 16 }}>
                  {unit.galleryImages.map((image, index) => (
                    <div
                      key={`${image}-${index}`}
                      className={`portal-project-gallery-item${unit.featuredImageUrl === image ? ' is-featured' : ''}`}
                    >
                      <img src={image} alt={`${unit.unitNumber} photo ${index + 1}`} className="portal-project-gallery-thumb" />
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--eef-border)' }}>
                <div className="portal-featured-preview-label">Floor plan</div>
                {unit.floorPlanUrl ? (
                  /\.(png|jpe?g|webp|gif)$/i.test(unit.floorPlanUrl) ? (
                    <div className="portal-featured-preview" style={{ margin: '8px 0 0' }}>
                      <img src={unit.floorPlanUrl} alt={`${unit.unitNumber} floor plan`} />
                      <div className="portal-gallery-item-actions" style={{ marginTop: 10 }}>
                        <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-inline-btn">
                          Download / Open
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: '8px 0 0' }}>
                      <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer" className="portal-inline-btn">
                        Download / Open Floor Plan
                      </a>
                    </p>
                  )
                ) : (
                  <div className="portal-empty-state" style={{ marginTop: 8 }}>No floor plan uploaded yet.</div>
                )}
              </div>
            </article>

            <div className="portal-detail-grid">
              <article className="portal-card portal-detail-hero-card">
                <h2>Unit Overview</h2>
                <div className="portal-detail-tags">
                  <span>{unit.hasBalcony ? 'Balcony' : 'No balcony'}</span>
                  <span>{unit.hasStore ? 'Store' : 'No store'}</span>
                  <span>{unit.parkingSlots} parking</span>
                  <span>v{unit.version}</span>
                </div>
                <div className="portal-detail-stats">
                  <div>
                    <span>Price (KES)</span>
                    <strong>{formatMoney(unit.priceKes, 'KES')}</strong>
                  </div>
                  <div>
                    <span>Price (USD)</span>
                    <strong>{formatMoney(unit.priceUsd, 'USD')}</strong>
                  </div>
                  <div>
                    <span>Primary Owner</span>
                    <strong>
                      {primaryOwnerCustomer ? (
                        <Link href={`/portal/customers/${primaryOwnerCustomer.id}`}>{customerLabel(primaryOwnerCustomer)}</Link>
                      ) : (
                        'Unassigned'
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Floor Plan</span>
                    <strong>
                      {unit.floorPlanUrl ? (
                        <a href={unit.floorPlanUrl} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        'Not uploaded'
                      )}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="portal-card portal-payment-summary-card">
                <h2>Payment Progress</h2>
                <div className="portal-payment-summary-grid">
                  <div>
                    <span>Agreed ({paymentSummary.currency})</span>
                    <strong>{formatMoney(paymentSummary.agreed, paymentSummary.currency)}</strong>
                  </div>
                  <div>
                    <span>Paid</span>
                    <strong>{formatMoney(paymentSummary.paid, paymentSummary.currency)}</strong>
                  </div>
                  <div>
                    <span>Balance</span>
                    <strong>{formatMoney(paymentSummary.balance, paymentSummary.currency)}</strong>
                  </div>
                  <div>
                    <span>Percentage Paid</span>
                    <strong>{paymentSummary.percentPaid.toFixed(1)}%</strong>
                  </div>
                </div>
                <div className="portal-progress-track" aria-hidden="true">
                  <div className="portal-progress-fill" style={{ width: `${paymentSummary.percentPaid}%` }} />
                </div>
                <p style={{ margin: '14px 0 0', fontSize: 13, color: '#5e5e5e' }}>
                  Based on {matchedContracts.length} contract{matchedContracts.length === 1 ? '' : 's'} and{' '}
                  {matchedPayments.length} payment{matchedPayments.length === 1 ? '' : 's'}.
                </p>
              </article>
            </div>

            <article className="portal-card">
              <h2 style={{ margin: '0 0 8px' }}>Amenities</h2>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5e5e5e' }}>
                Attach amenities from the shared catalog to this unit.{' '}
                <Link href="/portal/amenities">Manage the catalog</Link>.
              </p>

              {unitAmenitiesError ? <div className="portal-error" style={{ marginBottom: 12 }}>{unitAmenitiesError}</div> : null}

              {canUpdateUnit ? (
                <div className="portal-entity-form" style={{ marginBottom: 16 }}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Add Amenity</span>
                      <select value={unitAmenityToAdd} onChange={(event) => setUnitAmenityToAdd(event.target.value)}>
                        <option value="">Select amenity</option>
                        {allAmenities
                          .filter((amenity) => !unitAmenities.some((link) => link.amenityId === amenity.id))
                          .map((amenity) => (
                            <option key={amenity.id} value={amenity.id}>
                              {amenity.icon ? `${amenity.icon} ` : ''}
                              {amenity.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        className="portal-primary-btn"
                        disabled={unitAmenitiesMutating || !unitAmenityToAdd}
                        onClick={() => void onAttachUnitAmenity()}
                      >
                        {unitAmenitiesMutating ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="portal-list-stack">
                {unitAmenities.length === 0 ? (
                  <div className="portal-empty-state">No amenities attached to this unit yet.</div>
                ) : (
                  unitAmenities.map((link) => (
                    <div key={link.id} className="portal-list-row">
                      <div>
                        <strong>
                          {link.amenity.icon ? `${link.amenity.icon} ` : ''}
                          {link.amenity.name}
                        </strong>
                        {link.amenity.description ? <p>{link.amenity.description}</p> : null}
                      </div>
                      {canUpdateUnit ? (
                        <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDetachUnitAmenity(link.amenityId)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </article>

            <div className="portal-section-grid">
              <article className="portal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                  <h2 style={{ margin: 0 }}>Owners</h2>
                  {canAssignOwner ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => setShowAssignForm((prev) => !prev)}
                    >
                      {showAssignForm ? 'Close' : 'Assign Owner'}
                    </button>
                  ) : null}
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5e5e5e' }}>
                  Allocated ownership: {totalOwnership.toFixed(1)}%
                </p>

                {showAssignForm && canAssignOwner ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onAssignOwner}>
                    <label>
                      <span>Customer</span>
                      <select
                        value={assignForm.customerId}
                        onChange={(event) => setAssignForm((prev) => ({ ...prev, customerId: event.target.value }))}
                        required
                      >
                        <option value="">Select customer</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customerLabel(customer)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Ownership %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={assignForm.ownershipPercentage}
                          onChange={(event) =>
                            setAssignForm((prev) => ({ ...prev, ownershipPercentage: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="portal-check">
                        <input
                          type="checkbox"
                          checked={assignForm.isPrimaryOwner}
                          onChange={(event) =>
                            setAssignForm((prev) => ({ ...prev, isPrimaryOwner: event.target.checked }))
                          }
                        />
                        <span>Primary Owner</span>
                      </label>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Assign Owner'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {matchedOwnerships.length === 0 ? (
                    <div className="portal-empty-state">No owners assigned to this unit yet.</div>
                  ) : (
                    matchedOwnerships.map((ownership) => {
                      const owner = customerMap.get(ownership.customerId);
                      const nextOfKin = owner?.nextOfKinJson;

                      return (
                        <div key={ownership.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>
                                {owner ? (
                                  <Link href={`/portal/customers/${owner.id}`}>{customerLabel(owner)}</Link>
                                ) : (
                                  ownership.customerId
                                )}
                              </strong>
                              <p>
                                {owner?.email || 'No email'} • {owner?.phone || 'No phone'}
                              </p>
                              {nextOfKin?.name ? (
                                <p>
                                  Next of kin:{' '}
                                  {owner ? (
                                    <Link href={`/portal/customers/${owner.id}#next-of-kin`}>
                                      {nextOfKin.name}
                                      {nextOfKin.relationship ? ` (${nextOfKin.relationship})` : ''}
                                    </Link>
                                  ) : (
                                    nextOfKin.name
                                  )}
                                  {nextOfKin.phone ? ` • ${nextOfKin.phone}` : ''}
                                </p>
                              ) : (
                                <p>Next of kin: Not recorded</p>
                              )}
                            </div>
                            <span>{ownership.isPrimaryOwner ? 'PRIMARY' : 'CO-OWNER'}</span>
                            <span>{Number(ownership.ownershipPercentage).toFixed(1)}%</span>
                          </div>

                          <div className="portal-action-row">
                            {owner ? (
                              <Link href={`/portal/customers/${owner.id}`} className="portal-inline-btn">
                                View Owner
                              </Link>
                            ) : null}
                            {owner?.nextOfKinJson?.name ? (
                              <Link href={`/portal/customers/${owner.id}#next-of-kin`} className="portal-inline-btn">
                                Next of Kin
                              </Link>
                            ) : null}
                            {canUpdateOwner ? (
                              <button
                                type="button"
                                className="portal-inline-btn"
                                onClick={() => {
                                  setEditingOwnershipId(ownership.id);
                                  setOwnershipEditForm(makeOwnershipForm(ownership));
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                            {canUpdateOwner ? (
                              <button type="button" className="portal-inline-btn" onClick={() => void onTransferOwnership(ownership)}>
                                Transfer Ownership
                              </button>
                            ) : null}
                            {canDeleteOwner ? (
                              <button
                                type="button"
                                className="portal-inline-btn is-danger"
                                onClick={() => void onDeleteOwnership(ownership.id)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>

                          {editingOwnershipId === ownership.id && canUpdateOwner ? (
                            <form className="portal-entity-form portal-inline-form" onSubmit={onUpdateOwnership}>
                              <label>
                                <span>Owner (change ownership)</span>
                                <select
                                  value={ownershipEditForm.customerId}
                                  onChange={(event) =>
                                    setOwnershipEditForm((prev) => ({ ...prev, customerId: event.target.value }))
                                  }
                                  required
                                >
                                  <option value="">Select customer</option>
                                  {customers.map((customer) => (
                                    <option key={customer.id} value={customer.id}>
                                      {customerLabel(customer)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="portal-entity-grid-2">
                                <label>
                                  <span>Ownership %</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.01"
                                    value={ownershipEditForm.ownershipPercentage}
                                    onChange={(event) =>
                                      setOwnershipEditForm((prev) => ({
                                        ...prev,
                                        ownershipPercentage: event.target.value,
                                      }))
                                    }
                                    required
                                  />
                                </label>
                                <label className="portal-check">
                                  <input
                                    type="checkbox"
                                    checked={ownershipEditForm.isPrimaryOwner}
                                    onChange={(event) =>
                                      setOwnershipEditForm((prev) => ({
                                        ...prev,
                                        isPrimaryOwner: event.target.checked,
                                      }))
                                    }
                                  />
                                  <span>Primary Owner</span>
                                </label>
                              </div>
                              <div className="portal-inline-actions">
                                <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="portal-ghost-btn"
                                  onClick={() => setEditingOwnershipId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </article>

              <article className="portal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                  <h2 style={{ margin: 0 }}>Sales Contracts</h2>
                  {canCreateContract ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        setContractForm(
                          makeContractForm(unit, primaryOwner?.customerId || customers[0]?.id || ''),
                        );
                        setShowContractForm((prev) => !prev);
                      }}
                    >
                      {showContractForm ? 'Close' : 'New Contract'}
                    </button>
                  ) : null}
                </div>

                {showContractForm && canCreateContract ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateContract}>
                    <label>
                      <span>Contract Number</span>
                      <input
                        value={contractForm.contractNumber}
                        onChange={(event) =>
                          setContractForm((prev) => ({ ...prev, contractNumber: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Primary Customer</span>
                      <select
                        value={contractForm.primaryCustomerId}
                        onChange={(event) =>
                          setContractForm((prev) => ({ ...prev, primaryCustomerId: event.target.value }))
                        }
                        required
                      >
                        <option value="">Select customer</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customerLabel(customer)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Currency</span>
                        <select
                          value={contractForm.currency}
                          onChange={(event) =>
                            setContractForm((prev) => ({ ...prev, currency: event.target.value }))
                          }
                        >
                          <option value="KES">KES</option>
                          <option value="USD">USD</option>
                        </select>
                      </label>
                      <label>
                        <span>Total Agreed Price</span>
                        <input
                          value={contractForm.totalAgreedPrice}
                          onChange={(event) =>
                            setContractForm((prev) => ({ ...prev, totalAgreedPrice: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <label>
                      <span>Status</span>
                      <select
                        value={contractForm.contractStatus}
                        onChange={(event) =>
                          setContractForm((prev) => ({ ...prev, contractStatus: event.target.value }))
                        }
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Create Contract'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {matchedContracts.length === 0 ? (
                    <div className="portal-empty-state">No sales contracts linked to this unit.</div>
                  ) : (
                    matchedContracts.map((contract) => {
                      const buyer = customerMap.get(contract.primaryCustomerId);
                      const contractPaid = matchedPayments
                        .filter((payment) => payment.contractId === contract.id)
                        .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
                      const contractAgreed = Number(contract.totalAgreedPrice || 0);
                      const contractPercent = contractAgreed > 0 ? Math.min((contractPaid / contractAgreed) * 100, 100) : 0;

                      return (
                        <div key={contract.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{contract.contractNumber}</strong>
                              <p>
                                Buyer:{' '}
                                {buyer ? (
                                  <Link href={`/portal/customers/${buyer.id}`}>{customerLabel(buyer)}</Link>
                                ) : (
                                  contract.primaryCustomerId
                                )}
                              </p>
                              <p>
                                Paid {formatMoney(contractPaid, contract.currency)} of{' '}
                                {formatMoney(contract.totalAgreedPrice, contract.currency)} ({contractPercent.toFixed(1)}
                                %)
                              </p>
                            </div>
                            <span>{contract.contractStatus}</span>
                            <span>{contract.currency}</span>
                          </div>
                          <div className="portal-action-row">
                            <Link href={`/portal/sales-contracts/${contract.id}`} className="portal-inline-btn">
                              Payment Schedule
                            </Link>
                            {canDeleteContract ? (
                              <button
                                type="button"
                                className="portal-inline-btn is-danger"
                                onClick={() => void onDeleteContract(contract.id)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            </div>

            <article className="portal-card portal-detail-payments-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ margin: 0 }}>Transaction History</h2>
                {canCreatePayment ? (
                  <button
                    type="button"
                    className="portal-inline-btn"
                    onClick={() => {
                      setPaymentForm(makePaymentForm(undefined, matchedContracts[0]?.id || ''));
                      setShowPaymentForm((prev) => !prev);
                    }}
                    disabled={matchedContracts.length === 0}
                    title={matchedContracts.length === 0 ? 'Create a sales contract first' : undefined}
                  >
                    {showPaymentForm ? 'Close' : 'Record Payment'}
                  </button>
                ) : null}
              </div>

              {matchedContracts.length === 0 ? (
                <div className="portal-empty-state">
                  Payments require a sales contract. Create a contract for this unit to start recording transactions.
                </div>
              ) : null}

              {showPaymentForm && canCreatePayment && matchedContracts.length > 0 ? (
                <form className="portal-entity-form portal-detail-form" onSubmit={onCreatePayment}>
                  <p className="portal-muted" style={{ margin: '0 0 4px' }}>
                    The receipt number is generated automatically once the payment is recorded.
                  </p>
                  <label>
                    <span>Contract</span>
                    <select
                      value={paymentForm.contractId}
                      onChange={(event) =>
                        setPaymentForm((prev) => ({ ...prev, contractId: event.target.value }))
                      }
                      required
                    >
                      <option value="">Select contract</option>
                      {matchedContracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>
                          {contract.contractNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Amount Paid</span>
                      <input
                        value={paymentForm.amountPaid}
                        onChange={(event) =>
                          setPaymentForm((prev) => ({ ...prev, amountPaid: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Currency</span>
                      <select
                        value={paymentForm.currency}
                        onChange={(event) =>
                          setPaymentForm((prev) => ({ ...prev, currency: event.target.value }))
                        }
                      >
                        <option value="KES">KES</option>
                        <option value="USD">USD</option>
                      </select>
                    </label>
                    <label>
                      <span>Method</span>
                      <select
                        value={paymentForm.paymentMethod}
                        onChange={(event) =>
                          setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
                        }
                      >
                        <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                        <option value="CASH">CASH</option>
                        <option value="CARD">CARD</option>
                        <option value="CHEQUE">CHEQUE</option>
                        <option value="MOBILE_MONEY">MOBILE_MONEY</option>
                      </select>
                    </label>
                  </div>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Transaction Reference</span>
                      <input
                        value={paymentForm.transactionReference}
                        onChange={(event) =>
                          setPaymentForm((prev) => ({ ...prev, transactionReference: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Payment Date</span>
                      <input
                        type="date"
                        value={paymentForm.paymentDate}
                        onChange={(event) =>
                          setPaymentForm((prev) => ({ ...prev, paymentDate: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <button type="submit" className="portal-primary-btn" disabled={mutating}>
                    {mutating ? 'Saving...' : 'Record Payment'}
                  </button>
                </form>
              ) : null}

              <div className="portal-list-stack">
                {matchedPayments.length === 0 ? (
                  <div className="portal-empty-state">No payment transactions recorded for this unit yet.</div>
                ) : (
                  matchedPayments.map((payment) => {
                    const contract = matchedContracts.find((item) => item.id === payment.contractId);

                    return (
                      <div key={payment.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{payment.receiptNumber}</strong>
                            <p>
                              {payment.transactionReference} • {payment.paymentMethod.replaceAll('_', ' ')}
                            </p>
                            <p>
                              Contract: {contract?.contractNumber || payment.contractId} • {formatDate(payment.paymentDate)}
                            </p>
                          </div>
                          <span>{payment.currency}</span>
                          <span>{formatMoney(payment.amountPaid, payment.currency)}</span>
                        </div>

                        <div className="portal-action-row">
                          <button
                            type="button"
                            className="portal-inline-btn"
                            disabled={downloadingReceiptId === payment.id}
                            onClick={() => void onDownloadReceipt(payment)}
                          >
                            {downloadingReceiptId === payment.id ? 'Preparing...' : 'Download Receipt'}
                          </button>
                          {canUpdatePayment ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                setEditingPaymentId(payment.id);
                                setPaymentEditForm(makePaymentForm(payment));
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {canUpdatePayment ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onReallocatePayment(payment)}>
                              Reallocate
                            </button>
                          ) : null}
                          {canDeletePayment ? (
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() => void onDeletePayment(payment.id)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>

                        {editingPaymentId === payment.id && canUpdatePayment ? (
                          <form className="portal-entity-form portal-inline-form" onSubmit={onUpdatePayment}>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Receipt Number</span>
                                <input value={paymentEditForm.receiptNumber} disabled readOnly />
                              </label>
                              <label>
                                <span>Contract</span>
                                <select
                                  value={paymentEditForm.contractId}
                                  onChange={(event) =>
                                    setPaymentEditForm((prev) => ({ ...prev, contractId: event.target.value }))
                                  }
                                  required
                                >
                                  {matchedContracts.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.contractNumber}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="portal-entity-grid-3">
                              <label>
                                <span>Amount Paid</span>
                                <input
                                  value={paymentEditForm.amountPaid}
                                  onChange={(event) =>
                                    setPaymentEditForm((prev) => ({ ...prev, amountPaid: event.target.value }))
                                  }
                                  required
                                />
                              </label>
                              <label>
                                <span>Currency</span>
                                <select
                                  value={paymentEditForm.currency}
                                  onChange={(event) =>
                                    setPaymentEditForm((prev) => ({ ...prev, currency: event.target.value }))
                                  }
                                >
                                  <option value="KES">KES</option>
                                  <option value="USD">USD</option>
                                </select>
                              </label>
                              <label>
                                <span>Method</span>
                                <select
                                  value={paymentEditForm.paymentMethod}
                                  onChange={(event) =>
                                    setPaymentEditForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
                                  }
                                >
                                  <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                                  <option value="CASH">CASH</option>
                                  <option value="CARD">CARD</option>
                                  <option value="CHEQUE">CHEQUE</option>
                                  <option value="MOBILE_MONEY">MOBILE_MONEY</option>
                                </select>
                              </label>
                            </div>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Transaction Reference</span>
                                <input
                                  value={paymentEditForm.transactionReference}
                                  onChange={(event) =>
                                    setPaymentEditForm((prev) => ({
                                      ...prev,
                                      transactionReference: event.target.value,
                                    }))
                                  }
                                  required
                                />
                              </label>
                              <label>
                                <span>Payment Date</span>
                                <input
                                  type="date"
                                  value={paymentEditForm.paymentDate}
                                  onChange={(event) =>
                                    setPaymentEditForm((prev) => ({ ...prev, paymentDate: event.target.value }))
                                  }
                                />
                              </label>
                            </div>
                            <div className="portal-inline-actions">
                              <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                Save
                              </button>
                              <button
                                type="button"
                                className="portal-ghost-btn"
                                onClick={() => setEditingPaymentId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            {canReadOwnershipAudits ? (
              <article className="portal-card">
                <h2>Ownership Trail</h2>
                <div className="portal-list-stack">
                  {ownershipAudits.length === 0 ? (
                    <div className="portal-empty-state">No ownership changes recorded yet.</div>
                  ) : (
                    ownershipAudits.map((audit) => {
                      const fromCustomer = audit.fromCustomerId
                        ? customerMap.get(audit.fromCustomerId)
                        : null;
                      const toCustomer = audit.toCustomerId ? customerMap.get(audit.toCustomerId) : null;
                      return (
                        <div key={audit.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{audit.action}</strong>
                              <p>
                                {fromCustomer || toCustomer
                                  ? `${fromCustomer ? customerLabel(fromCustomer) : '—'} → ${
                                      toCustomer ? customerLabel(toCustomer) : '—'
                                    }`
                                  : 'Ownership change'}
                              </p>
                              <p>
                                {audit.fromPercentage != null || audit.toPercentage != null
                                  ? `${audit.fromPercentage != null ? `${Number(audit.fromPercentage).toFixed(1)}%` : '—'} → ${
                                      audit.toPercentage != null ? `${Number(audit.toPercentage).toFixed(1)}%` : '—'
                                    }`
                                  : 'Percentage unchanged'}
                                {audit.reason ? ` • ${audit.reason}` : ''}
                              </p>
                              <p>
                                By {audit.changedBy} • {formatDate(audit.timestamp)}
                              </p>
                            </div>
                            <span>{audit.action}</span>
                            <span>
                              {toCustomer ? (
                                <Link href={`/portal/customers/${toCustomer.id}`}>Owner</Link>
                              ) : (
                                '—'
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            ) : null}

            <UnitRentalPanel
              unitId={unitId}
              customers={customers}
              tenancies={tenancies}
              utilityCharges={utilityCharges}
              rentalPayments={rentalPayments}
              collections={collections}
              collectionsFrom={collectionsFrom}
              collectionsTo={collectionsTo}
              onCollectionsFromChange={setCollectionsFrom}
              onCollectionsToChange={setCollectionsTo}
              onLoadCollections={() => void loadCollectionsOnly()}
              mutating={mutating}
              rentChangeRequests={rentChangeRequests}
              onReviewRentChange={(id, status) => void reviewRentChange(id, status)}
              reminderPreview={reminderPreview}
              reminderLoading={reminderLoading}
              reminderSendingId={reminderSendingId}
              canPreviewReminders={canPreviewReminders}
              canSendReminders={canSendReminders}
              onPreviewReminders={() => void previewReminders()}
              onSendReminder={(item) => void sendReminder(item)}
              onSendAllReminders={() => void sendAllReminders()}
              canCreateTenancy={canCreateTenancy}
              canUpdateTenancy={canUpdateTenancy}
              canDeleteTenancy={canDeleteTenancy}
              canCreatePayment={canCreateRentalPayment}
              canUpdatePayment={canUpdateRentalPayment}
              canDeletePayment={canDeleteRentalPayment}
              onCreateTenancy={createTenancy}
              onUpdateTenancy={updateTenancy}
              onDeleteTenancy={deleteTenancy}
              onCreateRentalPayment={createRentalPayment}
              onUpdateRentalPayment={updateRentalPayment}
              onDeleteRentalPayment={deleteRentalPayment}
            />
          </div>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
