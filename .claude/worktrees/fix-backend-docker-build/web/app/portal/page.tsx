"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';
import { PortalShell } from './components/portal-shell';
import RentalCollectionsPanel from './rental-collections-panel';
import { CsvUnitUploader } from './components/csv-unit-uploader';

type AuthMode = 'login' | 'register';
type PortalTab = 'projects' | 'units' | 'customers' | 'operations' | 'finance' | 'analytics' | 'rbac';

type AuthRole = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  roles: AuthRole[];
  permissions: string[];
  createdAt?: string;
};

type PermissionRecord = {
  id: string;
  action: string;
  subject: string;
  key: string;
  description: string | null;
  isSystem: boolean;
};

type ChartOfAccountOption = { id: string; code: string; name: string; type: string };

type Amenity = { id: string; name: string; description?: string | null; icon?: string | null; category?: string | null };
type ProjectAmenityLink = { id: string; projectId: string; amenityId: string; amenity: Amenity };

type ProjectBankAccount = {
  id: string;
  type: 'BANK' | 'MOBILE_MONEY';
  name: string;
  bankName: string;
  accountNumber: string;
  branch?: string | null;
  currencyCode: string;
  glAccountId: string;
  projectId?: string | null;
  isActive: boolean;
};

const ACCOUNT_PURPOSES = ['SALES', 'RENT', 'UTILITIES', 'SUPPLIER_PAYMENTS', 'TAX_REMITTANCE', 'GENERAL'] as const;
type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

const ACCOUNT_PURPOSE_LABELS: Record<AccountPurpose, string> = {
  SALES: 'Unit Sales Collections',
  RENT: 'Rent Collections',
  UTILITIES: 'Utilities Collections',
  SUPPLIER_PAYMENTS: 'Supplier Payments',
  TAX_REMITTANCE: 'Tax Remittance',
  GENERAL: 'General / Fallback',
};

type ProjectAccountAssignment = {
  id: string;
  projectId: string;
  purpose: AccountPurpose;
  bankAccountId: string;
  bankAccount: ProjectBankAccount;
};

type ProjectBankAccountForm = {
  type: 'BANK' | 'MOBILE_MONEY';
  name: string;
  bankName: string;
  accountNumber: string;
  branch: string;
  glAccountId: string;
};

function makeProjectBankAccountForm(): ProjectBankAccountForm {
  return { type: 'BANK', name: '', bankName: '', accountNumber: '', branch: '', glAccountId: '' };
}

type RoleRecord = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: PermissionRecord[];
};

type ProjectBlock = {
  id: string;
  projectId: string;
  blockName: string;
  totalFloors: number;
  units?: Unit[];
};

type Project = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  location: string | null;
  featuredImageUrl?: string | null;
  galleryImages?: string[] | null;
  isArchived: boolean;
  blocks?: ProjectBlock[];
};

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
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalIdPassport: string;
};

type UnitOwnership = {
  id: string;
  unitId: string;
  customerId: string;
  ownershipPercentage: string | number;
  isPrimaryOwner: boolean;
};

type SalesContract = {
  id: string;
  contractNumber: string;
  unitId: string;
  primaryCustomerId: string;
  currency: string;
  totalAgreedPrice: string | number;
  contractStatus: string;
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

type PaymentReallocationAudit = {
  id: string;
  paymentId: string;
  sourceContractId: string | null;
  destinationContractId: string | null;
  reallocatedAmount: string | number;
  reason: string;
  reallocatedBy: string;
  timestamp: string;
};

type DashboardState = {
  projects: Project[];
  units: Unit[];
  customers: Customer[];
  blocks: ProjectBlock[];
  ownerships: UnitOwnership[];
  contracts: SalesContract[];
  payments: CustomerPayment[];
  audits: PaymentReallocationAudit[];
};

type RbacState = {
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  users: AuthProfile[];
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'drl_access_token';
const EMPTY_DASHBOARD_STATE: DashboardState = {
  projects: [],
  units: [],
  customers: [],
  blocks: [],
  ownerships: [],
  contracts: [],
  payments: [],
  audits: [],
};

const EMPTY_RBAC_STATE: RbacState = {
  roles: [],
  permissions: [],
  users: [],
};

type ProjectForm = {
  code: string;
  name: string;
  description: string;
  location: string;
  featuredImageUrl: string;
  galleryImages: string[];
  isArchived: boolean;
};

type UnitForm = {
  blockId: string;
  unitNumber: string;
  floorNumber: string;
  sizeSqm: string;
  priceKes: string;
  priceUsd: string;
  status: Unit['status'];
  bedrooms: string;
  parkingSlots: string;
  hasBalcony: boolean;
  hasStore: boolean;
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalIdPassport: string;
  kraPin: string;
};

type ProjectBlockForm = {
  projectId: string;
  blockName: string;
  totalFloors: string;
};

type OwnershipForm = {
  unitId: string;
  customerId: string;
  ownershipPercentage: string;
  isPrimaryOwner: boolean;
};

type ContractForm = {
  contractNumber: string;
  unitId: string;
  primaryCustomerId: string;
  currency: string;
  totalAgreedPrice: string;
  contractStatus: string;
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

type AuditForm = {
  paymentId: string;
  sourceContractId: string;
  destinationContractId: string;
  reallocatedAmount: string;
  reason: string;
  reallocatedBy: string;
};

type RoleForm = {
  name: string;
  description: string;
  permissionIds: string[];
};

type UserRoleAssignmentForm = {
  userId: string;
  roleIds: string[];
};

function parseErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (Array.isArray(record.message)) {
      const messages = record.message.filter((entry) => typeof entry === 'string') as string[];
      if (messages.length > 0) {
        return messages.join('. ');
      }
    }
    if (typeof record.error === 'string') {
      return record.error;
    }
  }

  return 'Request failed. Please try again.';
}

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errorPayload: unknown = null;
    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = await response.text();
    }
    throw new Error(parseErrorMessage(errorPayload));
  }

  if (response.status === 204) {
    return null as T;
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
    let errorPayload: unknown = null;
    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = await response.text();
    }
    throw new Error(parseErrorMessage(errorPayload));
  }

  return (await response.json()) as { objectKey: string; url: string };
}

function formatCurrencyKes(value: string | number): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return 'KES 0';
  }

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
}

function hasPermission(profile: Pick<AuthProfile, 'permissions'> | null | undefined, permission: string): boolean {
  return Boolean(profile?.permissions.includes(permission));
}

function toggleSelection(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function stripProjectGallery(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function makeProjectForm(project?: Project): ProjectForm {
  return {
    code: project?.code || '',
    name: project?.name || '',
    description: project?.description || '',
    location: project?.location || '',
    featuredImageUrl: project?.featuredImageUrl || '',
    galleryImages: stripProjectGallery(project?.galleryImages),
    isArchived: project?.isArchived || false,
  };
}

function makeUnitForm(unit?: Unit): UnitForm {
  return {
    blockId: unit?.blockId || '',
    unitNumber: unit?.unitNumber || '',
    floorNumber: unit ? String(unit.floorNumber) : '',
    sizeSqm: unit ? String(unit.sizeSqm) : '',
    priceKes: unit ? String(unit.priceKes) : '',
    priceUsd: unit ? String(unit.priceUsd) : '',
    status: unit?.status || 'AVAILABLE',
    bedrooms: unit ? String(unit.bedrooms) : '0',
    parkingSlots: unit ? String(unit.parkingSlots) : '0',
    hasBalcony: unit?.hasBalcony || false,
    hasStore: unit?.hasStore || false,
  };
}

function makeCustomerForm(customer?: Customer): CustomerForm {
  return {
    firstName: customer?.firstName || '',
    lastName: customer?.lastName || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    nationalIdPassport: customer?.nationalIdPassport || '',
    kraPin: '',
  };
}

function makeProjectBlockForm(): ProjectBlockForm {
  return {
    projectId: '',
    blockName: '',
    totalFloors: '1',
  };
}

function makeOwnershipForm(): OwnershipForm {
  return {
    unitId: '',
    customerId: '',
    ownershipPercentage: '100',
    isPrimaryOwner: true,
  };
}

function makeContractForm(): ContractForm {
  return {
    contractNumber: '',
    unitId: '',
    primaryCustomerId: '',
    currency: 'KES',
    totalAgreedPrice: '',
    contractStatus: 'ACTIVE',
  };
}

function makePaymentForm(): PaymentForm {
  return {
    receiptNumber: '',
    contractId: '',
    amountPaid: '',
    currency: 'KES',
    paymentMethod: 'BANK_TRANSFER',
    transactionReference: '',
    paymentDate: '',
  };
}

function makeAuditForm(userEmail?: string): AuditForm {
  return {
    paymentId: '',
    sourceContractId: '',
    destinationContractId: '',
    reallocatedAmount: '',
    reason: '',
    reallocatedBy: userEmail || '',
  };
}

function makeRoleForm(role?: RoleRecord): RoleForm {
  return {
    name: role?.name || '',
    description: role?.description || '',
    permissionIds: role?.permissions.map((permission) => permission.id) || [],
  };
}

function makeUserRoleAssignmentForm(user?: AuthProfile): UserRoleAssignmentForm {
  return {
    userId: user?.id || '',
    roleIds: user?.roles.map((role) => role.id) || [],
  };
}

export default function PortalPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const pathname = usePathname();
  const projectCreateMode = pathname.includes('/portal/projects/new');
  const projectDetailMatch = pathname.match(/\/portal\/projects\/([^/]+)$/);
  const projectRouteId = projectDetailMatch && !projectCreateMode ? decodeURIComponent(projectDetailMatch[1]) : null;
  const rbacCreateMode = pathname.includes('/portal/rbac/new');
  const rbacUsersMode = pathname.includes('/portal/rbac/users');
  const rbacEditMatch = pathname.match(/\/portal\/rbac\/([^/]+)\/edit/);
  const editingRoleRouteId = rbacEditMatch ? decodeURIComponent(rbacEditMatch[1]) : null;
  const tab: PortalTab = pathname.includes('/portal/units')
    ? 'units'
    : pathname.includes('/portal/customers')
      ? 'customers'
      : pathname.includes('/portal/operations')
        ? 'operations'
        : pathname.includes('/portal/finance')
          ? 'finance'
          : pathname.includes('/portal/analytics')
            ? 'analytics'
            : pathname.includes('/portal/rbac')
              ? 'rbac'
          : 'projects';
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState>(EMPTY_DASHBOARD_STATE);
  const [rbac, setRbac] = useState<RbacState>(EMPTY_RBAC_STATE);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

  const [projectForm, setProjectForm] = useState<ProjectForm>(makeProjectForm());
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectEditForm, setProjectEditForm] = useState<ProjectForm>(makeProjectForm());
  const [projectCreateStep, setProjectCreateStep] = useState<1 | 2>(1);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const [projectBankAccounts, setProjectBankAccounts] = useState<ProjectBankAccount[]>([]);
  const [projectAccountAssignments, setProjectAccountAssignments] = useState<ProjectAccountAssignment[]>([]);
  const [loadingProjectAccounts, setLoadingProjectAccounts] = useState(false);
  const [projectAccountsError, setProjectAccountsError] = useState<string | null>(null);
  const [projectAccountsMutating, setProjectAccountsMutating] = useState(false);
  const [showProjectBankForm, setShowProjectBankForm] = useState(false);
  const [projectBankForm, setProjectBankForm] = useState<ProjectBankAccountForm>(makeProjectBankAccountForm());
  const [projectAssignmentForm, setProjectAssignmentForm] = useState<{ purpose: AccountPurpose; bankAccountId: string }>({
    purpose: 'SALES',
    bankAccountId: '',
  });

  const [unitForm, setUnitForm] = useState<UnitForm>(makeUnitForm());
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitEditForm, setUnitEditForm] = useState<UnitForm>(makeUnitForm());
  const [unitAddMode, setUnitAddMode] = useState<'manual' | 'csv'>('manual');

  const [customerForm, setCustomerForm] = useState<CustomerForm>(makeCustomerForm());
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState<CustomerForm>(makeCustomerForm());
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOwnershipFilter, setCustomerOwnershipFilter] = useState<'all' | 'owners' | 'non-owners'>('all');
  const [customerContractFilter, setCustomerContractFilter] = useState<'all' | 'buyers' | 'non-buyers'>('all');
  const [customerSort, setCustomerSort] = useState<'name-asc' | 'name-desc' | 'email-asc'>('name-asc');

  const [blockForm, setBlockForm] = useState<ProjectBlockForm>(makeProjectBlockForm());
  const [ownershipForm, setOwnershipForm] = useState<OwnershipForm>(makeOwnershipForm());
  const [contractForm, setContractForm] = useState<ContractForm>(makeContractForm());
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(makePaymentForm());
  const [auditForm, setAuditForm] = useState<AuditForm>(makeAuditForm());
  const [roleForm, setRoleForm] = useState<RoleForm>(makeRoleForm());
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [userRoleForm, setUserRoleForm] = useState<UserRoleAssignmentForm>(makeUserRoleAssignmentForm());

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });

  const [registerForm, setRegisterForm] = useState({
    name: 'Portfolio Manager',
    email: '',
    password: '',
  });

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setInitialized(true);
      return;
    }

    void hydrateSession(savedToken);
  }, []);

  const stats = useMemo(() => {
    const availableUnits = dashboard.units.filter((unit) => unit.status === 'AVAILABLE').length;
    const reservedUnits = dashboard.units.filter((unit) => unit.status === 'RESERVED').length;
    const soldUnits = dashboard.units.filter((unit) => unit.status === 'SOLD').length;

    return {
      projectCount: dashboard.projects.length,
      unitCount: dashboard.units.length,
      customerCount: dashboard.customers.length,
      ownershipCount: dashboard.ownerships.length,
      contractCount: dashboard.contracts.length,
      paymentCount: dashboard.payments.length,
      availableUnits,
      reservedUnits,
      soldUnits,
    };
  }, [dashboard]);

  const analytics = useMemo(() => {
    const totalContractValue = dashboard.contracts.reduce((sum, contract) => sum + Number(contract.totalAgreedPrice || 0), 0);
    const totalCollected = dashboard.payments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const collectionRate = totalContractValue > 0 ? (totalCollected / totalContractValue) * 100 : 0;

    const unitsWithOwnership = new Set(dashboard.ownerships.map((ownership) => ownership.unitId)).size;
    const ownershipCoverage = dashboard.units.length > 0 ? (unitsWithOwnership / dashboard.units.length) * 100 : 0;

    const paymentsByMethod = dashboard.payments.reduce<Record<string, number>>((accumulator, payment) => {
      const key = payment.paymentMethod || 'UNKNOWN';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    const statusCounts = dashboard.units.reduce<Record<string, number>>((accumulator, unit) => {
      accumulator[unit.status] = (accumulator[unit.status] || 0) + 1;
      return accumulator;
    }, {});

    return {
      totalContractValue,
      totalCollected,
      outstandingBalance: Math.max(totalContractValue - totalCollected, 0),
      collectionRate,
      unitsWithOwnership,
      ownershipCoverage,
      paymentsByMethod,
      statusCounts,
    };
  }, [dashboard]);

  const roleLabel = profile?.roles.length
    ? profile.roles.map((role) => role.name).join(', ')
    : profile?.role || 'UNASSIGNED';
  const isAdmin = profile?.roles.some((role) => role.name === 'ADMIN') || profile?.role === 'ADMIN';
  const canReadRbac =
    hasPermission(profile, 'role.read') || hasPermission(profile, 'permission.read') || hasPermission(profile, 'user.read');
  const canManageRoles =
    hasPermission(profile, 'role.create') || hasPermission(profile, 'role.update') || hasPermission(profile, 'role.delete');
  const canManageUsers = hasPermission(profile, 'user.update');

  const blockOptions = useMemo(
    () =>
      dashboard.projects.flatMap((project) =>
        (project.blocks || []).map((block) => ({
          id: block.id,
          label: `${project.code} • Block ${block.blockName}`,
        })),
      ),
    [dashboard.projects],
  );

  const projectOptions = useMemo(
    () => dashboard.projects.map((project) => ({ id: project.id, label: `${project.code} • ${project.name}` })),
    [dashboard.projects],
  );

  const unitOptions = useMemo(
    () => dashboard.units.map((unit) => ({ id: unit.id, label: `${unit.unitNumber} (${unit.status})` })),
    [dashboard.units],
  );

  const customerOptions = useMemo(
    () =>
      dashboard.customers.map((customer) => ({
        id: customer.id,
        label: `${customer.firstName} ${customer.lastName}`,
      })),
    [dashboard.customers],
  );

  const ownerCustomerIds = useMemo(
    () => new Set(dashboard.ownerships.map((ownership) => ownership.customerId)),
    [dashboard.ownerships],
  );

  const buyerCustomerIds = useMemo(
    () => new Set(dashboard.contracts.map((contract) => contract.primaryCustomerId)),
    [dashboard.contracts],
  );

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    const next = dashboard.customers.filter((customer) => {
      const isOwner = ownerCustomerIds.has(customer.id);
      const isBuyer = buyerCustomerIds.has(customer.id);

      if (customerOwnershipFilter === 'owners' && !isOwner) {
        return false;
      }
      if (customerOwnershipFilter === 'non-owners' && isOwner) {
        return false;
      }
      if (customerContractFilter === 'buyers' && !isBuyer) {
        return false;
      }
      if (customerContractFilter === 'non-buyers' && isBuyer) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        customer.firstName,
        customer.lastName,
        `${customer.firstName} ${customer.lastName}`,
        customer.email,
        customer.phone,
        customer.nationalIdPassport,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });

    next.sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      if (customerSort === 'name-desc') {
        return nameB.localeCompare(nameA);
      }
      if (customerSort === 'email-asc') {
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase());
      }
      return nameA.localeCompare(nameB);
    });

    return next;
  }, [
    dashboard.customers,
    customerSearch,
    customerOwnershipFilter,
    customerContractFilter,
    customerSort,
    ownerCustomerIds,
    buyerCustomerIds,
  ]);

  const contractOptions = useMemo(
    () =>
      dashboard.contracts.map((contract) => ({
        id: contract.id,
        label: `${contract.contractNumber} (${contract.contractStatus})`,
      })),
    [dashboard.contracts],
  );

  const paymentOptions = useMemo(
    () =>
      dashboard.payments.map((payment) => ({
        id: payment.id,
        label: `${payment.receiptNumber} • ${payment.transactionReference}`,
      })),
    [dashboard.payments],
  );

  const permissionGroups = useMemo(() => {
    return rbac.permissions.reduce<Record<string, PermissionRecord[]>>((groups, permission) => {
      if (!groups[permission.subject]) {
        groups[permission.subject] = [];
      }
      groups[permission.subject].push(permission);
      groups[permission.subject].sort((left, right) => left.action.localeCompare(right.action));
      return groups;
    }, {});
  }, [rbac.permissions]);

  const selectedUser = useMemo(
    () => rbac.users.find((user) => user.id === userRoleForm.userId) || null,
    [rbac.users, userRoleForm.userId],
  );

  const editingRole = useMemo(
    () => (editingRoleRouteId ? rbac.roles.find((role) => role.id === editingRoleRouteId) || null : null),
    [editingRoleRouteId, rbac.roles],
  );

  const isRbacEditView = Boolean(editingRoleRouteId);
  const activeProject = useMemo(
    () => (projectRouteId ? dashboard.projects.find((project) => project.id === projectRouteId) || null : null),
    [dashboard.projects, projectRouteId],
  );
  const activeProjectBlocks = activeProject?.blocks || [];

  const [glAccounts, setGlAccounts] = useState<ChartOfAccountOption[]>([]);

  const [allAmenities, setAllAmenities] = useState<Amenity[]>([]);
  const [projectAmenities, setProjectAmenities] = useState<ProjectAmenityLink[]>([]);
  const [projectAmenityToAdd, setProjectAmenityToAdd] = useState('');
  const [projectAmenitiesMutating, setProjectAmenitiesMutating] = useState(false);
  const [projectAmenitiesError, setProjectAmenitiesError] = useState<string | null>(null);

  const loadProjectAmenities = useCallback(
    async (projectId: string, authToken: string) => {
      setProjectAmenitiesError(null);
      try {
        const [catalog, linked] = await Promise.all([
          hasPermission(profile, 'amenity.read') ? apiRequest<Amenity[]>('/amenities', { method: 'GET' }, authToken) : Promise.resolve([]),
          hasPermission(profile, 'amenity.read')
            ? apiRequest<ProjectAmenityLink[]>(`/projects/${projectId}/amenities`, { method: 'GET' }, authToken)
            : Promise.resolve([]),
        ]);
        setAllAmenities(catalog);
        setProjectAmenities(linked);
      } catch (error) {
        setProjectAmenitiesError(error instanceof Error ? error.message : 'Unable to load amenities.');
      }
    },
    [profile],
  );

  useEffect(() => {
    if (activeProject && token) {
      void loadProjectAmenities(activeProject.id, token);
    } else {
      setProjectAmenities([]);
    }
  }, [activeProject, token, loadProjectAmenities]);

  async function onAttachProjectAmenity() {
    if (!requireAdminAction() || !token || !activeProject || !projectAmenityToAdd) return;
    setProjectAmenitiesMutating(true);
    setProjectAmenitiesError(null);
    try {
      await apiRequest(`/projects/${activeProject.id}/amenities/${projectAmenityToAdd}`, { method: 'POST' }, token);
      setProjectAmenityToAdd('');
      await loadProjectAmenities(activeProject.id, token);
    } catch (error) {
      setProjectAmenitiesError(error instanceof Error ? error.message : 'Unable to attach amenity.');
    } finally {
      setProjectAmenitiesMutating(false);
    }
  }

  async function onDetachProjectAmenity(amenityId: string) {
    if (!requireAdminAction() || !token || !activeProject) return;
    setProjectAmenitiesMutating(true);
    setProjectAmenitiesError(null);
    try {
      await apiRequest(`/projects/${activeProject.id}/amenities/${amenityId}`, { method: 'DELETE' }, token);
      await loadProjectAmenities(activeProject.id, token);
    } catch (error) {
      setProjectAmenitiesError(error instanceof Error ? error.message : 'Unable to remove amenity.');
    } finally {
      setProjectAmenitiesMutating(false);
    }
  }

  const loadProjectAccounting = useCallback(
    async (projectId: string, authToken: string) => {
      setLoadingProjectAccounts(true);
      setProjectAccountsError(null);
      try {
        const [banks, assignments, accounts] = await Promise.all([
          hasPermission(profile, 'bank-account.read')
            ? apiRequest<ProjectBankAccount[]>(`/bank-accounts?projectId=${projectId}`, { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(profile, 'project-account-assignment.read')
            ? apiRequest<ProjectAccountAssignment[]>(`/projects/${projectId}/account-assignments`, { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(profile, 'chart-of-account.read')
            ? apiRequest<ChartOfAccountOption[]>('/chart-of-accounts', { method: 'GET' }, authToken)
            : Promise.resolve([]),
        ]);
        setProjectBankAccounts(banks);
        setProjectAccountAssignments(assignments);
        setGlAccounts(accounts);
      } catch (error) {
        setProjectAccountsError(error instanceof Error ? error.message : 'Unable to load project accounts.');
      } finally {
        setLoadingProjectAccounts(false);
      }
    },
    [profile],
  );

  useEffect(() => {
    if (activeProject && token) {
      void loadProjectAccounting(activeProject.id, token);
    } else {
      setProjectBankAccounts([]);
      setProjectAccountAssignments([]);
    }
  }, [activeProject, token, loadProjectAccounting]);

  async function onCreateProjectBankAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !activeProject) return;
    setProjectAccountsMutating(true);
    setProjectAccountsError(null);
    try {
      await apiRequest(
        '/bank-accounts',
        {
          method: 'POST',
          body: JSON.stringify({
            type: projectBankForm.type,
            name: projectBankForm.name,
            bankName: projectBankForm.bankName,
            accountNumber: projectBankForm.accountNumber,
            branch: projectBankForm.branch || undefined,
            glAccountId: projectBankForm.glAccountId,
            projectId: activeProject.id,
          }),
        },
        token,
      );
      setMutationMessage('Bank account added.');
      setShowProjectBankForm(false);
      setProjectBankForm(makeProjectBankAccountForm());
      await loadProjectAccounting(activeProject.id, token);
    } catch (error) {
      setProjectAccountsError(error instanceof Error ? error.message : 'Unable to add bank account.');
    } finally {
      setProjectAccountsMutating(false);
    }
  }

  async function onAssignProjectAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !activeProject) return;
    setProjectAccountsMutating(true);
    setProjectAccountsError(null);
    try {
      await apiRequest(
        `/projects/${activeProject.id}/account-assignments`,
        { method: 'POST', body: JSON.stringify(projectAssignmentForm) },
        token,
      );
      setMutationMessage('Account assignment saved.');
      setProjectAssignmentForm({ purpose: 'SALES', bankAccountId: '' });
      await loadProjectAccounting(activeProject.id, token);
    } catch (error) {
      setProjectAccountsError(error instanceof Error ? error.message : 'Unable to save assignment.');
    } finally {
      setProjectAccountsMutating(false);
    }
  }

  async function onDeleteProjectAssignment(id: string) {
    if (!requireAdminAction() || !token || !activeProject) return;
    setProjectAccountsMutating(true);
    setProjectAccountsError(null);
    try {
      await apiRequest(`/projects/${activeProject.id}/account-assignments/${id}`, { method: 'DELETE' }, token);
      setMutationMessage('Account assignment removed.');
      await loadProjectAccounting(activeProject.id, token);
    } catch (error) {
      setProjectAccountsError(error instanceof Error ? error.message : 'Unable to remove assignment.');
    } finally {
      setProjectAccountsMutating(false);
    }
  }

  async function hydrateSession(nextToken: string) {
    setLoadingDashboard(true);
    setErrorMessage(null);

    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, nextToken);

      setToken(nextToken);
      setProfile(nextProfile);
      await refreshDashboard(nextToken, nextProfile);
      setAuditForm(makeAuditForm(nextProfile.email));
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      setMutationMessage(null);
    } catch (error) {
      setToken(null);
      setProfile(null);
      setDashboard(EMPTY_DASHBOARD_STATE);
      setRbac(EMPTY_RBAC_STATE);
      window.localStorage.removeItem(TOKEN_KEY);
      setErrorMessage(error instanceof Error ? error.message : 'Could not authenticate with backend.');
    } finally {
      setLoadingDashboard(false);
      setInitialized(true);
    }
  }

  async function refreshDashboard(activeToken?: string, activeProfile?: AuthProfile | null) {
    const authToken = activeToken || token;
    if (!authToken) {
      return;
    }

    const nextProfile =
      activeProfile || (await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken));

    const [projects, units, customers, blocks, ownerships, contracts, payments, audits, roles, permissions, users] = await Promise.all([
      hasPermission(nextProfile, 'project.read')
        ? apiRequest<Project[]>('/projects?include=blocks,blocks.units', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'unit.read')
        ? apiRequest<Unit[]>('/units', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'customer.read')
        ? apiRequest<Customer[]>('/customers?take=500', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'project-block.read')
        ? apiRequest<ProjectBlock[]>('/project-block', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'unit-ownership.read')
        ? apiRequest<UnitOwnership[]>('/unit-ownerships?take=200', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'sales-contract.read')
        ? apiRequest<SalesContract[]>('/sales-contracts?take=200', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'customer-payment.read')
        ? apiRequest<CustomerPayment[]>('/customer-payments?take=200', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'payment-reallocation-audit.read')
        ? apiRequest<PaymentReallocationAudit[]>('/payment-reallocation-audits?take=200', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'role.read') ? apiRequest<RoleRecord[]>('/roles', { method: 'GET' }, authToken) : Promise.resolve([]),
      hasPermission(nextProfile, 'permission.read')
        ? apiRequest<PermissionRecord[]>('/permissions', { method: 'GET' }, authToken)
        : Promise.resolve([]),
      hasPermission(nextProfile, 'user.read') ? apiRequest<AuthProfile[]>('/users', { method: 'GET' }, authToken) : Promise.resolve([]),
    ]);

    setProfile(nextProfile);
    setDashboard({ projects, units, customers, blocks, ownerships, contracts, payments, audits });
    setRbac({ roles, permissions, users });
    setAuditForm((current) => ({ ...current, reallocatedBy: nextProfile.email }));
    setUserRoleForm((current) => {
      if (!current.userId) {
        return current;
      }

      const matchedUser = users.find((user) => user.id === current.userId);
      return matchedUser ? makeUserRoleAssignmentForm(matchedUser) : makeUserRoleAssignmentForm();
    });
  }

  function requireAdminAction(): boolean {
    if (isAdmin) {
      return true;
    }

    setMutationMessage('Agent role is read-only. Switch to an admin account to modify records.');
    return false;
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    if (mutating) {
      return;
    }

    setMutating(true);
    setMutationMessage(null);
    setErrorMessage(null);

    try {
      await action();
      await refreshDashboard();
      setMutationMessage(successMessage);
    } catch (error) {
      setMutationMessage(error instanceof Error ? error.message : 'Mutation failed.');
    } finally {
      setMutating(false);
    }
  }

  async function onCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      const createdProject = await apiRequest<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(projectForm),
      }, token);
      setCreatedProjectId(createdProject.id);
      setBlockForm({ ...makeProjectBlockForm(), projectId: createdProject.id });
      setProjectCreateStep(2);
    }, 'Project created.');
  }

  async function onUpdateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !editingProjectId) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/projects/${editingProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify(projectEditForm),
      }, token);
      setEditingProjectId(null);
      setProjectEditForm(makeProjectForm());
    }, 'Project updated.');
  }

  async function onProjectFeaturedImageSelected(files: FileList | null, target: 'create' | 'edit') {
    if (!files?.length || !token) {
      return;
    }

    try {
      setUploadingMedia(true);
      const image = await uploadMedia(files[0], token);
      if (!image) {
        return;
      }

      if (target === 'create') {
        setProjectForm((prev) => ({ ...prev, featuredImageUrl: image.url }));
      } else {
        setProjectEditForm((prev) => ({ ...prev, featuredImageUrl: image.url }));
      }
    } catch (error) {
      setMutationMessage(error instanceof Error ? error.message : 'Could not load selected image.');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function onProjectGallerySelected(files: FileList | null, target: 'create' | 'edit') {
    if (!files?.length || !token) {
      return;
    }

    try {
      setUploadingMedia(true);
      const images = (await Promise.all(Array.from(files).map((file) => uploadMedia(file, token)))).map(
        (upload) => upload.url,
      );
      if (!images.length) {
        return;
      }

      if (target === 'create') {
        setProjectForm((prev) => ({ ...prev, galleryImages: [...prev.galleryImages, ...images] }));
      } else {
        setProjectEditForm((prev) => ({ ...prev, galleryImages: [...prev.galleryImages, ...images] }));
      }
    } catch (error) {
      setMutationMessage(error instanceof Error ? error.message : 'Could not load selected images.');
    } finally {
      setUploadingMedia(false);
    }
  }

  function removeProjectGalleryImage(target: 'create' | 'edit', index: number) {
    if (target === 'create') {
      setProjectForm((prev) => ({
        ...prev,
        galleryImages: prev.galleryImages.filter((_, imageIndex) => imageIndex !== index),
      }));
      return;
    }

    setProjectEditForm((prev) => ({
      ...prev,
      galleryImages: prev.galleryImages.filter((_, imageIndex) => imageIndex !== index),
    }));
  }

  async function onDeleteProject(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/projects/${id}`, { method: 'DELETE' }, token);
      if (editingProjectId === id) {
        setEditingProjectId(null);
      }
    }, 'Project deleted.');
  }

  async function onCreateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/units', {
        method: 'POST',
        body: JSON.stringify({
          ...unitForm,
          floorNumber: Number(unitForm.floorNumber),
          bedrooms: Number(unitForm.bedrooms),
          parkingSlots: Number(unitForm.parkingSlots),
        }),
      }, token);
      setUnitForm(makeUnitForm());
    }, 'Unit created.');
  }

  async function onUpdateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !editingUnitId) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/units/${editingUnitId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...unitEditForm,
          floorNumber: Number(unitEditForm.floorNumber),
          bedrooms: Number(unitEditForm.bedrooms),
          parkingSlots: Number(unitEditForm.parkingSlots),
        }),
      }, token);
      setEditingUnitId(null);
      setUnitEditForm(makeUnitForm());
    }, 'Unit updated.');
  }

  async function onDeleteUnit(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/units/${id}`, { method: 'DELETE' }, token);
      if (editingUnitId === id) {
        setEditingUnitId(null);
      }
    }, 'Unit deleted.');
  }

  async function onCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify({
          ...customerForm,
          kraPin: customerForm.kraPin || undefined,
        }),
      }, token);
      setCustomerForm(makeCustomerForm());
    }, 'Customer created.');
  }

  async function onUpdateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !editingCustomerId) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/customers/${editingCustomerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...customerEditForm,
          kraPin: customerEditForm.kraPin || undefined,
        }),
      }, token);
      setEditingCustomerId(null);
      setCustomerEditForm(makeCustomerForm());
    }, 'Customer updated.');
  }

  async function onDeleteCustomer(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/customers/${id}`, { method: 'DELETE' }, token);
      if (editingCustomerId === id) {
        setEditingCustomerId(null);
      }
    }, 'Customer deleted.');
  }

  async function onCreateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/project-block', {
        method: 'POST',
        body: JSON.stringify({
          ...blockForm,
          totalFloors: Number(blockForm.totalFloors),
        }),
      }, token);
      setBlockForm(makeProjectBlockForm());
    }, 'Project block created.');
  }

  async function onDeleteBlock(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/project-block/${id}`, { method: 'DELETE' }, token);
    }, 'Project block deleted.');
  }

  async function onCreateOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/unit-ownerships', {
        method: 'POST',
        body: JSON.stringify({
          ...ownershipForm,
        }),
      }, token);
      setOwnershipForm(makeOwnershipForm());
    }, 'Unit assigned to customer.');
  }

  async function onDeleteOwnership(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/unit-ownerships/${id}`, { method: 'DELETE' }, token);
    }, 'Ownership record deleted.');
  }

  async function onCreateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/sales-contracts', {
        method: 'POST',
        body: JSON.stringify({
          ...contractForm,
        }),
      }, token);
      setContractForm(makeContractForm());
    }, 'Sales contract created.');
  }

  async function onDeleteContract(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/sales-contracts/${id}`, { method: 'DELETE' }, token);
    }, 'Sales contract deleted.');
  }

  async function onCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/customer-payments', {
        method: 'POST',
        body: JSON.stringify({
          ...paymentForm,
          paymentDate: paymentForm.paymentDate || undefined,
        }),
      }, token);
      setPaymentForm(makePaymentForm());
    }, 'Customer payment created.');
  }

  async function onDeletePayment(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/customer-payments/${id}`, { method: 'DELETE' }, token);
    }, 'Customer payment deleted.');
  }

  async function onCreateAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest('/payment-reallocation-audits', {
        method: 'POST',
        body: JSON.stringify({
          ...auditForm,
          sourceContractId: auditForm.sourceContractId || undefined,
          destinationContractId: auditForm.destinationContractId || undefined,
        }),
      }, token);
      setAuditForm(makeAuditForm(profile?.email));
    }, 'Reallocation audit created.');
  }

  async function onDeleteAudit(id: string) {
    if (!requireAdminAction() || !token) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/payment-reallocation-audits/${id}`, { method: 'DELETE' }, token);
    }, 'Reallocation audit deleted.');
  }

  function resetRoleEditor() {
    setEditingRoleId(null);
    setRoleForm(makeRoleForm());
  }

  async function onSubmitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !canManageRoles) {
      return;
    }

    const payload = {
      name: roleForm.name.trim().toUpperCase(),
      description: roleForm.description.trim() || undefined,
      permissionIds: roleForm.permissionIds,
    };

    await runMutation(async () => {
      if (editingRoleId) {
        await apiRequest(`/roles/${editingRoleId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }, token);
      } else {
        await apiRequest('/roles', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, token);
      }

      resetRoleEditor();
    }, editingRoleId ? 'Role updated.' : 'Role created.');
  }

  async function onDeleteRole(id: string) {
    if (!requireAdminAction() || !token || !hasPermission(profile, 'role.delete')) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/roles/${id}`, { method: 'DELETE' }, token);
    }, 'Role deleted.');
  }

  function onStartRoleEdit(role: RoleRecord) {
    setEditingRoleId(role.id);
    setRoleForm(makeRoleForm(role));
  }

  useEffect(() => {
    if (rbacCreateMode) {
      setEditingRoleId(null);
      setRoleForm(makeRoleForm());
      return;
    }

    if (editingRole) {
      setEditingRoleId(editingRole.id);
      setRoleForm(makeRoleForm(editingRole));
    }
  }, [editingRole, rbacCreateMode]);

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    setEditingProjectId(activeProject.id);
    setProjectEditForm(makeProjectForm(activeProject));
    setBlockForm((prev) => ({
      ...prev,
      projectId: activeProject.id,
    }));
  }, [activeProject]);

  function onSelectUserForRoleAssignment(userId: string) {
    const user = rbac.users.find((candidate) => candidate.id === userId);
    setUserRoleForm(makeUserRoleAssignmentForm(user));
  }

  async function onAssignUserRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAdminAction() || !token || !canManageUsers || !userRoleForm.userId) {
      return;
    }

    await runMutation(async () => {
      await apiRequest(`/users/${userRoleForm.userId}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds: userRoleForm.roleIds }),
      }, token);
    }, 'User role assignments updated.');
  }

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await apiRequest<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });

      await hydrateSession(result.access_token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerForm),
      });

      const result = await apiRequest<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: registerForm.email,
          password: registerForm.password,
        }),
      });

      await hydrateSession(result.access_token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to register.');
    } finally {
      setSubmitting(false);
    }
  }

  function onLogout() {
    setToken(null);
    setProfile(null);
    setDashboard(EMPTY_DASHBOARD_STATE);
    setRbac(EMPTY_RBAC_STATE);
    setEditingProjectId(null);
    setEditingUnitId(null);
    setEditingCustomerId(null);
    setCreatedProjectId(null);
    setProjectCreateStep(1);
    resetRoleEditor();
    setUserRoleForm(makeUserRoleAssignmentForm());
    setBlockForm(makeProjectBlockForm());
    setOwnershipForm(makeOwnershipForm());
    setContractForm(makeContractForm());
    setPaymentForm(makePaymentForm());
    setAuditForm(makeAuditForm());
    setMutationMessage(null);
    window.localStorage.removeItem(TOKEN_KEY);
  }

  const isAuthenticated = Boolean(initialized && token && profile && !loadingDashboard);

  return (
    <EliteLayout active="portal">
      <main className={`lp-main-content portal-main${isAuthenticated ? ' is-authenticated' : ''}`}>
        {!initialized || loadingDashboard ? (
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading secure workspace...</article>
          </section>
        ) : !token || !profile ? (
          <>
            <section className="lp-container portal-hero">
              <p className="portal-kicker">Elite Estate Control Center</p>
              <h1>Portfolio Operations Portal</h1>
              <p>
                Authenticate with the backend, review live inventory, and manage customer activity from a single refined
                dashboard based on the Elite Estate Framework.
              </p>
            </section>
            <section className="lp-container portal-auth-section">
              <article className="portal-card portal-auth-card">
                <div className="portal-auth-toggle" role="tablist" aria-label="Authentication mode">
                  <button
                    type="button"
                    className={mode === 'login' ? 'is-active' : ''}
                    onClick={() => setMode('login')}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={mode === 'register' ? 'is-active' : ''}
                    onClick={() => setMode('register')}
                  >
                    Register
                  </button>
                </div>

                {mode === 'login' ? (
                  <form className="portal-auth-form" onSubmit={onLogin}>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={loginForm.email}
                        onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Password</span>
                      <input
                        type="password"
                        value={loginForm.password}
                        onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                        required
                      />
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={submitting}>
                      {submitting ? 'Authorizing...' : 'Access Portal'}
                    </button>
                  </form>
                ) : (
                  <form className="portal-auth-form" onSubmit={onRegister}>
                    <label>
                      <span>Full Name</span>
                      <input
                        type="text"
                        value={registerForm.name}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={registerForm.email}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Password</span>
                      <input
                        type="password"
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                        minLength={8}
                        required
                      />
                    </label>
                    <p className="portal-note">
                      New accounts are created without privileged roles. Assign access from the RBAC console.
                    </p>
                    <button type="submit" className="portal-primary-btn" disabled={submitting}>
                      {submitting ? 'Creating Account...' : 'Register & Enter'}
                    </button>
                  </form>
                )}

                {errorMessage ? <p className="portal-error">{errorMessage}</p> : null}
              </article>
            </section>
          </>
        ) : (
          <section className="lp-container portal-auth-section">
            <PortalShell
              active={tab}
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions.length}
              canReadRbac={canReadRbac}
              canReadUsers={hasPermission(profile, 'user.read')}
              onLogout={onLogout}
              onRefresh={() => void refreshDashboard()}
              pageSubtitle="Review live inventory and manage customer, ownership, and rental activity."
            >
              {!profile.permissions.length ? (
                <article className="portal-card portal-role-banner">
                  This account is authenticated but has no assigned permissions yet. An administrator can assign roles
                  in the RBAC console.
                </article>
              ) : !isAdmin ? (
                <article className="portal-card portal-role-banner">
                  Access is now permission-based. This account can only perform the actions granted through assigned
                  roles.
                </article>
              ) : null}

              {mutationMessage ? <article className="portal-card portal-feedback">{mutationMessage}</article> : null}

              <div className="portal-stats-grid">
                <article className="portal-card portal-stat-card">
                  <p>Projects</p>
                  <h3>{stats.projectCount}</h3>
                </article>
                <article className="portal-card portal-stat-card">
                  <p>Total Units</p>
                  <h3>{stats.unitCount}</h3>
                </article>
                <article className="portal-card portal-stat-card">
                  <p>Customers</p>
                  <h3>{stats.customerCount}</h3>
                </article>
                <article className="portal-card portal-stat-card">
                  <p>Available / Reserved / Sold</p>
                  <h3>
                    {stats.availableUnits} / {stats.reservedUnits} / {stats.soldUnits}
                  </h3>
                </article>
                <article className="portal-card portal-stat-card">
                  <p>Ownership Records</p>
                  <h3>{stats.ownershipCount}</h3>
                </article>
                <article className="portal-card portal-stat-card">
                  <p>Contracts</p>
                  <h3>{stats.contractCount}</h3>
                </article>
                <article className="portal-card portal-stat-card">
                  <p>Payments</p>
                  <h3>{stats.paymentCount}</h3>
                </article>
              </div>

              {tab === 'projects' ? (
                <>
                  {!projectCreateMode && !projectRouteId ? (
                    <section className="portal-stack-grid">
                      <article className="portal-card portal-project-toolbar">
                        <div>
                          <p className="portal-kicker">Projects Index</p>
                          <h2>Portfolio Projects</h2>
                          <p className="portal-muted">Curated developments with project pages, block build-out, and on-site inventory management.</p>
                        </div>
                        {isAdmin ? (
                          <Link href="/portal/projects/new" className="portal-primary-btn portal-link-btn">
                            New Project Workflow
                          </Link>
                        ) : null}
                      </article>

                      <div className="portal-list-stack portal-project-list-stack">
                        {dashboard.projects.map((project) => (
                          <article key={project.id} className="portal-card portal-project-list-card">
                            <div className="portal-project-list-media">
                              {project.featuredImageUrl ? (
                                <img src={project.featuredImageUrl} alt={project.name} className="portal-project-image" />
                              ) : (
                                <div className="portal-project-image portal-project-image-placeholder">{project.code}</div>
                              )}
                            </div>
                            <div className="portal-project-list-content">
                              <div className="portal-project-list-header">
                                <div>
                                  <p className="portal-kicker">{project.code}</p>
                                  <h3>{project.name}</h3>
                                  <p className="portal-muted">{project.description || 'No project description yet.'}</p>
                                </div>
                                <span className="portal-chip">{project.isArchived ? 'ARCHIVED' : 'ACTIVE'}</span>
                              </div>
                              <div className="portal-project-meta-grid">
                                <div>
                                  <span>Location</span>
                                  <strong>{project.location || 'Location pending'}</strong>
                                </div>
                                <div>
                                  <span>Blocks</span>
                                  <strong>{(project.blocks || []).length}</strong>
                                </div>
                                <div>
                                  <span>Units</span>
                                  <strong>{(project.blocks || []).reduce((sum, block) => sum + (block.units?.length || 0), 0)}</strong>
                                </div>
                              </div>
                              <div className="portal-action-row">
                                <Link href={`/portal/projects/${project.id}`} className="portal-inline-btn">
                                  View Project
                                </Link>
                                <Link
                                  href={`/portal/projects/${project.id}/progress`}
                                  className="portal-inline-btn"
                                >
                                  Progress
                                </Link>
                                <Link
                                  href={`/portal/projects/${project.id}/construction`}
                                  className="portal-inline-btn"
                                >
                                  Construction
                                </Link>
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    onClick={() => void onDeleteProject(project.id)}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {projectCreateMode ? (
                    <section className="portal-stack-grid">
                      <article className="portal-card portal-project-toolbar">
                        <div>
                          <p className="portal-kicker">Project Workflow</p>
                          <h2>Create Project</h2>
                          <p className="portal-muted">Step 1 captures the development profile and imagery. Step 2 moves directly into block setup.</p>
                        </div>
                        <Link href="/portal/projects" className="portal-inline-btn">
                          Back to Projects
                        </Link>
                      </article>

                      <div className="portal-project-stepper">
                        <div className={projectCreateStep === 1 ? 'is-active' : ''}>1. Project Profile</div>
                        <div className={projectCreateStep === 2 ? 'is-active' : ''}>2. Blocks</div>
                      </div>

                      {projectCreateStep === 1 ? (
                        <div className="portal-data-grid portal-project-workflow-grid">
                          <article className="portal-card">
                            <form className="portal-entity-form" onSubmit={onCreateProject}>
                              <div className="portal-entity-grid-2">
                                <label>
                                  <span>Code</span>
                                  <input
                                    value={projectForm.code}
                                    onChange={(event) => setProjectForm((prev) => ({ ...prev, code: event.target.value }))}
                                    required
                                  />
                                </label>
                                <label>
                                  <span>Name</span>
                                  <input
                                    value={projectForm.name}
                                    onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                                    required
                                  />
                                </label>
                              </div>
                              <label>
                                <span>Description</span>
                                <textarea
                                  value={projectForm.description}
                                  onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
                                  rows={4}
                                />
                              </label>
                              <label>
                                <span>Location</span>
                                <input
                                  value={projectForm.location}
                                  onChange={(event) => setProjectForm((prev) => ({ ...prev, location: event.target.value }))}
                                />
                              </label>
                              <label>
                                <span>Featured Image</span>
                                <input type="file" accept="image/*" onChange={(event) => void onProjectFeaturedImageSelected(event.target.files, 'create')} />
                              </label>
                              <label>
                                <span>Gallery Images</span>
                                <input type="file" accept="image/*" multiple onChange={(event) => void onProjectGallerySelected(event.target.files, 'create')} />
                              </label>
                              <label className="portal-check">
                                <input
                                  type="checkbox"
                                  checked={projectForm.isArchived}
                                  onChange={(event) => setProjectForm((prev) => ({ ...prev, isArchived: event.target.checked }))}
                                />
                                <span>Archived</span>
                              </label>
                              <button type="submit" className="portal-primary-btn" disabled={mutating || uploadingMedia}>
                                {uploadingMedia ? 'Uploading Media...' : mutating ? 'Saving...' : 'Save & Continue to Blocks'}
                              </button>
                            </form>
                          </article>
                          <article className="portal-card">
                            <h2>Image Preview</h2>
                            <div className="portal-project-preview-stack">
                              {projectForm.featuredImageUrl ? (
                                <img src={projectForm.featuredImageUrl} alt="Project preview" className="portal-project-image is-large" />
                              ) : (
                                <div className="portal-project-image portal-project-image-placeholder is-large">Featured image preview</div>
                              )}
                              <div className="portal-project-gallery-grid">
                                {projectForm.galleryImages.map((image, index) => (
                                  <div key={`${image}-${index}`} className="portal-project-gallery-item">
                                    <img src={image} alt={`Gallery preview ${index + 1}`} className="portal-project-gallery-thumb" />
                                    <button type="button" className="portal-inline-btn is-danger" onClick={() => removeProjectGalleryImage('create', index)}>
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </article>
                        </div>
                      ) : null}

                      {projectCreateStep === 2 ? (
                        <div className="portal-section-grid portal-project-workflow-grid">
                          <article className="portal-card">
                            <h2>Create First Blocks</h2>
                            <form className="portal-entity-form" onSubmit={onCreateBlock}>
                              <label>
                                <span>Project</span>
                                <input value={dashboard.projects.find((project) => project.id === createdProjectId)?.name || ''} readOnly />
                              </label>
                              <div className="portal-entity-grid-2">
                                <label>
                                  <span>Block Name</span>
                                  <input
                                    value={blockForm.blockName}
                                    onChange={(event) => setBlockForm((prev) => ({ ...prev, blockName: event.target.value, projectId: createdProjectId || prev.projectId }))}
                                    required
                                  />
                                </label>
                                <label>
                                  <span>Total Floors</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={blockForm.totalFloors}
                                    onChange={(event) => setBlockForm((prev) => ({ ...prev, totalFloors: event.target.value, projectId: createdProjectId || prev.projectId }))}
                                    required
                                  />
                                </label>
                              </div>
                              <button type="submit" className="portal-primary-btn" disabled={mutating || !createdProjectId}>
                                {mutating ? 'Saving...' : 'Add Block'}
                              </button>
                            </form>
                            {createdProjectId ? (
                              <div className="portal-inline-actions">
                                <Link href={`/portal/projects/${createdProjectId}`} className="portal-primary-btn portal-link-btn">
                                  Finish in Project View
                                </Link>
                              </div>
                            ) : null}
                          </article>
                          <article className="portal-card">
                            <h2>Blocks Added</h2>
                            <div className="portal-list-stack">
                              {dashboard.blocks
                                .filter((block) => block.projectId === createdProjectId)
                                .map((block) => (
                                  <div key={block.id} className="portal-record">
                                    <div className="portal-list-row">
                                      <div>
                                        <strong>Block {block.blockName}</strong>
                                        <p>Ready for units</p>
                                      </div>
                                      <span>Floors</span>
                                      <span>{block.totalFloors}</span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </article>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {projectRouteId ? (
                    <section className="portal-stack-grid">
                      {!activeProject ? (
                        <article className="portal-card portal-error-panel">Project not found.</article>
                      ) : (
                        <>
                          <article className="portal-card portal-project-detail-hero">
                            <div className="portal-project-detail-media">
                              {projectEditForm.featuredImageUrl || activeProject.featuredImageUrl ? (
                                <img
                                  src={projectEditForm.featuredImageUrl || activeProject.featuredImageUrl || ''}
                                  alt={activeProject.name}
                                  className="portal-project-image is-large"
                                />
                              ) : (
                                <div className="portal-project-image portal-project-image-placeholder is-large">{activeProject.code}</div>
                              )}
                            </div>
                            <div className="portal-project-detail-content">
                              <p className="portal-kicker">Project Overview</p>
                              <h2>{activeProject.name}</h2>
                              <p className="portal-muted">{activeProject.description || 'No project narrative has been added yet.'}</p>
                              <div className="portal-project-meta-grid">
                                <div>
                                  <span>Code</span>
                                  <strong>{activeProject.code}</strong>
                                </div>
                                <div>
                                  <span>Location</span>
                                  <strong>{activeProject.location || 'Location pending'}</strong>
                                </div>
                                <div>
                                  <span>Blocks</span>
                                  <strong>{activeProjectBlocks.length}</strong>
                                </div>
                                <div>
                                  <span>Units</span>
                                  <strong>{activeProjectBlocks.reduce((sum, block) => sum + (block.units?.length || 0), 0)}</strong>
                                </div>
                              </div>
                              <div className="portal-action-row">
                                <Link
                                  href={`/portal/projects/${activeProject.id}/progress`}
                                  className="portal-primary-btn"
                                >
                                  Sales & Rental Progress
                                </Link>
                                <Link
                                  href={`/portal/projects/${activeProject.id}/construction`}
                                  className="portal-inline-btn"
                                >
                                  Construction Management
                                </Link>
                                {isAdmin || hasPermission(profile, 'project.update') ? (
                                  <Link
                                    href={`/portal/projects/${activeProject.id}/edit`}
                                    className="portal-inline-btn"
                                  >
                                    Edit Project
                                  </Link>
                                ) : null}
                                <Link href="/portal/projects" className="portal-inline-btn">
                                  Back to Projects
                                </Link>
                              </div>
                            </div>
                          </article>

                          {stripProjectGallery(activeProject.galleryImages).length > 0 ? (
                            <article className="portal-card">
                              <div className="portal-card-header-row">
                                <h2 style={{ margin: 0 }}>Gallery</h2>
                                {isAdmin || hasPermission(profile, 'project.update') ? (
                                  <Link
                                    href={`/portal/projects/${activeProject.id}/edit`}
                                    className="portal-inline-btn"
                                  >
                                    Manage Images
                                  </Link>
                                ) : null}
                              </div>
                              <div className="portal-project-gallery-grid">
                                {stripProjectGallery(activeProject.galleryImages).map((image, index) => (
                                  <div
                                    key={`${image}-${index}`}
                                    className={`portal-project-gallery-item${
                                      activeProject.featuredImageUrl === image ? ' is-featured' : ''
                                    }`}
                                  >
                                    <img
                                      src={image}
                                      alt={`Project image ${index + 1}`}
                                      className="portal-project-gallery-thumb"
                                    />
                                    {activeProject.featuredImageUrl === image ? (
                                      <span className="portal-featured-badge">Featured</span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </article>
                          ) : null}

                          <article className="portal-card">
                            <div className="portal-card-header-row">
                              <h2 style={{ margin: 0 }}>Bank &amp; Mobile Money Accounts</h2>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => {
                                    setProjectBankForm(makeProjectBankAccountForm());
                                    setShowProjectBankForm((prev) => !prev);
                                  }}
                                >
                                  {showProjectBankForm ? 'Close' : 'New Account'}
                                </button>
                              ) : null}
                            </div>
                            <p className="portal-muted" style={{ margin: '0 0 12px' }}>
                              Accounts dedicated to this project&apos;s collections and disbursements. Assign a
                              different account per purpose below — e.g. unit sales can collect into one account
                              while rent and utilities post to others.
                            </p>

                            {projectAccountsError ? <div className="portal-error" style={{ marginBottom: 12 }}>{projectAccountsError}</div> : null}

                            {showProjectBankForm && isAdmin ? (
                              <form className="portal-entity-form portal-detail-form" onSubmit={onCreateProjectBankAccount}>
                                <div className="portal-entity-grid-2">
                                  <label>
                                    <span>Account Type</span>
                                    <select
                                      value={projectBankForm.type}
                                      onChange={(event) => setProjectBankForm((prev) => ({ ...prev, type: event.target.value as 'BANK' | 'MOBILE_MONEY' }))}
                                    >
                                      <option value="BANK">Bank Account</option>
                                      <option value="MOBILE_MONEY">Mobile Money</option>
                                    </select>
                                  </label>
                                  <label>
                                    <span>Account Name</span>
                                    <input
                                      value={projectBankForm.name}
                                      onChange={(event) => setProjectBankForm((prev) => ({ ...prev, name: event.target.value }))}
                                      required
                                    />
                                  </label>
                                </div>
                                <div className="portal-entity-grid-2">
                                  <label>
                                    <span>{projectBankForm.type === 'MOBILE_MONEY' ? 'Provider (e.g. M-Pesa)' : 'Bank Name'}</span>
                                    <input
                                      value={projectBankForm.bankName}
                                      onChange={(event) => setProjectBankForm((prev) => ({ ...prev, bankName: event.target.value }))}
                                      required
                                    />
                                  </label>
                                  <label>
                                    <span>{projectBankForm.type === 'MOBILE_MONEY' ? 'Phone / Till Number' : 'Account Number'}</span>
                                    <input
                                      value={projectBankForm.accountNumber}
                                      onChange={(event) => setProjectBankForm((prev) => ({ ...prev, accountNumber: event.target.value }))}
                                      required
                                    />
                                  </label>
                                </div>
                                <div className="portal-entity-grid-2">
                                  <label>
                                    <span>Branch (optional)</span>
                                    <input
                                      value={projectBankForm.branch}
                                      onChange={(event) => setProjectBankForm((prev) => ({ ...prev, branch: event.target.value }))}
                                    />
                                  </label>
                                  <label>
                                    <span>GL Account</span>
                                    <select
                                      value={projectBankForm.glAccountId}
                                      onChange={(event) => setProjectBankForm((prev) => ({ ...prev, glAccountId: event.target.value }))}
                                      required
                                    >
                                      <option value="">Select GL account</option>
                                      {glAccounts
                                        .filter((account) => account.type === 'ASSET')
                                        .map((account) => (
                                          <option key={account.id} value={account.id}>
                                            {account.code} — {account.name}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                </div>
                                <button type="submit" className="portal-primary-btn" disabled={projectAccountsMutating}>
                                  {projectAccountsMutating ? 'Saving...' : 'Add Account'}
                                </button>
                              </form>
                            ) : null}

                            <div className="portal-list-stack">
                              {loadingProjectAccounts ? (
                                <div className="portal-empty-state">Loading accounts...</div>
                              ) : projectBankAccounts.length === 0 ? (
                                <div className="portal-empty-state">No accounts dedicated to this project yet.</div>
                              ) : (
                                projectBankAccounts.map((bank) => (
                                  <div key={bank.id} className="portal-list-row">
                                    <div>
                                      <strong>{bank.name}</strong>
                                      <p>
                                        {bank.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank'} • {bank.bankName} • {bank.accountNumber}
                                      </p>
                                    </div>
                                    <span>{bank.currencyCode}</span>
                                    <span>{bank.isActive ? 'Active' : 'Inactive'}</span>
                                  </div>
                                ))
                              )}
                            </div>

                            <h3 style={{ margin: '20px 0 8px' }}>Purpose Assignments</h3>
                            <p className="portal-muted" style={{ margin: '0 0 12px' }}>
                              Unassigned purposes fall back to the company default Cash and Bank account.
                            </p>

                            {isAdmin ? (
                              <form className="portal-entity-form portal-detail-form" onSubmit={onAssignProjectAccount}>
                                <div className="portal-entity-grid-2">
                                  <label>
                                    <span>Purpose</span>
                                    <select
                                      value={projectAssignmentForm.purpose}
                                      onChange={(event) =>
                                        setProjectAssignmentForm((prev) => ({ ...prev, purpose: event.target.value as AccountPurpose }))
                                      }
                                    >
                                      {ACCOUNT_PURPOSES.map((purpose) => (
                                        <option key={purpose} value={purpose}>
                                          {ACCOUNT_PURPOSE_LABELS[purpose]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    <span>Bank / Mobile Money Account</span>
                                    <select
                                      value={projectAssignmentForm.bankAccountId}
                                      onChange={(event) =>
                                        setProjectAssignmentForm((prev) => ({ ...prev, bankAccountId: event.target.value }))
                                      }
                                      required
                                    >
                                      <option value="">Select account</option>
                                      {projectBankAccounts.map((bank) => (
                                        <option key={bank.id} value={bank.id}>
                                          {bank.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <button type="submit" className="portal-primary-btn" disabled={projectAccountsMutating || projectBankAccounts.length === 0}>
                                  {projectAccountsMutating ? 'Saving...' : 'Save Assignment'}
                                </button>
                              </form>
                            ) : null}

                            <div className="portal-list-stack">
                              {projectAccountAssignments.length === 0 ? (
                                <div className="portal-empty-state">No purpose assignments configured yet.</div>
                              ) : (
                                projectAccountAssignments.map((assignment) => (
                                  <div key={assignment.id} className="portal-list-row">
                                    <div>
                                      <strong>{ACCOUNT_PURPOSE_LABELS[assignment.purpose]}</strong>
                                      <p>{assignment.bankAccount?.name}</p>
                                    </div>
                                    {isAdmin ? (
                                      <button
                                        type="button"
                                        className="portal-inline-btn is-danger"
                                        onClick={() => void onDeleteProjectAssignment(assignment.id)}
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </article>

                          <article className="portal-card">
                            <h2 style={{ margin: '0 0 8px' }}>Amenities</h2>
                            <p className="portal-muted" style={{ margin: '0 0 12px' }}>
                              Attach amenities from the shared catalog to this project.{' '}
                              <Link href="/portal/amenities">Manage the catalog</Link>.
                            </p>
                            {projectAmenitiesError ? <div className="portal-error" style={{ marginBottom: 12 }}>{projectAmenitiesError}</div> : null}

                            {isAdmin ? (
                              <div className="portal-entity-form" style={{ marginBottom: 16 }}>
                                <div className="portal-entity-grid-2">
                                  <label>
                                    <span>Add Amenity</span>
                                    <select value={projectAmenityToAdd} onChange={(event) => setProjectAmenityToAdd(event.target.value)}>
                                      <option value="">Select amenity</option>
                                      {allAmenities
                                        .filter((amenity) => !projectAmenities.some((link) => link.amenityId === amenity.id))
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
                                      disabled={projectAmenitiesMutating || !projectAmenityToAdd}
                                      onClick={() => void onAttachProjectAmenity()}
                                    >
                                      {projectAmenitiesMutating ? 'Adding...' : 'Add'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="portal-list-stack">
                              {projectAmenities.length === 0 ? (
                                <div className="portal-empty-state">No amenities attached to this project yet.</div>
                              ) : (
                                projectAmenities.map((link) => (
                                  <div key={link.id} className="portal-list-row">
                                    <div>
                                      <strong>
                                        {link.amenity.icon ? `${link.amenity.icon} ` : ''}
                                        {link.amenity.name}
                                      </strong>
                                      {link.amenity.description ? <p>{link.amenity.description}</p> : null}
                                    </div>
                                    {isAdmin ? (
                                      <button
                                        type="button"
                                        className="portal-inline-btn is-danger"
                                        onClick={() => void onDetachProjectAmenity(link.amenityId)}
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </article>

                          <div className="portal-data-grid portal-project-workflow-grid">
                            <article className="portal-card">
                              <h2>Blocks</h2>
                              {isAdmin ? (
                                <form className="portal-entity-form portal-detail-form" onSubmit={onCreateBlock}>
                                  <div className="portal-entity-grid-2">
                                    <label>
                                      <span>Block Name</span>
                                      <input
                                        value={blockForm.blockName}
                                        onChange={(event) => setBlockForm((prev) => ({ ...prev, blockName: event.target.value, projectId: activeProject.id }))}
                                        required
                                      />
                                    </label>
                                    <label>
                                      <span>Total Floors</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={blockForm.totalFloors}
                                        onChange={(event) => setBlockForm((prev) => ({ ...prev, totalFloors: event.target.value, projectId: activeProject.id }))}
                                        required
                                      />
                                    </label>
                                  </div>
                                  <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                    {mutating ? 'Saving...' : 'Add Block'}
                                  </button>
                                </form>
                              ) : null}

                              <div className="portal-list-stack">
                                {activeProjectBlocks.map((block) => (
                                  <div key={block.id} className="portal-record">
                                    <div className="portal-list-row">
                                      <div>
                                        <strong>Block {block.blockName}</strong>
                                        <p>{block.units?.length || 0} units</p>
                                      </div>
                                      <span>Floors</span>
                                      <span>{block.totalFloors}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </article>

                            <article className="portal-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <h2 style={{ margin: 0 }}>Add Units</h2>
                                {isAdmin ? (
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                      type="button"
                                      className={unitAddMode === 'manual' ? 'portal-primary-btn' : 'portal-ghost-btn'}
                                      onClick={() => setUnitAddMode('manual')}
                                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                    >
                                      Single Unit
                                    </button>
                                    <button
                                      type="button"
                                      className={unitAddMode === 'csv' ? 'portal-primary-btn' : 'portal-ghost-btn'}
                                      onClick={() => setUnitAddMode('csv')}
                                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                    >
                                      📁 Upload CSV
                                    </button>
                                  </div>
                                ) : null}
                              </div>

                              {isAdmin ? (
                                unitAddMode === 'csv' ? (
                                  <CsvUnitUploader
                                    blocks={activeProjectBlocks}
                                    token={token}
                                    isAdmin={isAdmin}
                                    onSuccess={async () => {
                                      await refreshDashboard(token, profile);
                                    }}
                                    setMutationMessage={setMutationMessage}
                                  />
                                ) : (
                                  <form className="portal-entity-form" onSubmit={onCreateUnit}>
                                    <label>
                                      <span>Block</span>
                                      <select
                                        value={unitForm.blockId}
                                        onChange={(event) => setUnitForm((prev) => ({ ...prev, blockId: event.target.value }))}
                                        required
                                      >
                                        <option value="">Select block</option>
                                        {activeProjectBlocks.map((block) => (
                                          <option key={block.id} value={block.id}>
                                            Block {block.blockName}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <div className="portal-entity-grid-2">
                                      <label>
                                        <span>Unit Number</span>
                                        <input value={unitForm.unitNumber} onChange={(event) => setUnitForm((prev) => ({ ...prev, unitNumber: event.target.value }))} required />
                                      </label>
                                      <label>
                                        <span>Floor</span>
                                        <input type="number" value={unitForm.floorNumber} onChange={(event) => setUnitForm((prev) => ({ ...prev, floorNumber: event.target.value }))} required />
                                      </label>
                                    </div>
                                    <div className="portal-entity-grid-3">
                                      <label>
                                        <span>Size (sqm)</span>
                                        <input value={unitForm.sizeSqm} onChange={(event) => setUnitForm((prev) => ({ ...prev, sizeSqm: event.target.value }))} required />
                                      </label>
                                      <label>
                                        <span>Price KES</span>
                                        <input value={unitForm.priceKes} onChange={(event) => setUnitForm((prev) => ({ ...prev, priceKes: event.target.value }))} required />
                                      </label>
                                      <label>
                                        <span>Price USD</span>
                                        <input value={unitForm.priceUsd} onChange={(event) => setUnitForm((prev) => ({ ...prev, priceUsd: event.target.value }))} required />
                                      </label>
                                    </div>
                                    <label>
                                      <span>Bedrooms</span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={unitForm.bedrooms}
                                        onChange={(event) => setUnitForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
                                      />
                                    </label>
                                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                      {mutating ? 'Saving...' : 'Add Unit'}
                                    </button>
                                  </form>
                                )
                              ) : null}

                              <div className="portal-list-stack">
                                {activeProjectBlocks.flatMap((block) => (block.units || []).map((unit) => (
                                  <div key={unit.id} className="portal-record">
                                    <div className="portal-list-row">
                                      <div>
                                        <strong>{unit.unitNumber}</strong>
                                        <p>Block {block.blockName}</p>
                                      </div>
                                      <span>Unit</span>
                                      <span>
                                        <Link href={`/portal/units/${unit.id}`} className="portal-inline-btn">Open</Link>
                                      </span>
                                    </div>
                                  </div>
                                )))}
                              </div>
                            </article>
                          </div>
                        </>
                      )}
                    </section>
                  ) : null}
                </>
              ) : null}

              {tab === 'units' ? (
                <>
                  <div className="portal-action-row" style={{ marginBottom: '1rem', alignItems: 'center' }}>
                    <Link href="/portal/amenities" className="portal-ghost-btn">
                      Manage Amenities
                    </Link>
                  </div>
                  <section className="portal-section-grid">
                  {isAdmin ? (
                    <article className="portal-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h2 style={{ margin: 0 }}>Create Units</h2>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className={unitAddMode === 'manual' ? 'portal-primary-btn' : 'portal-ghost-btn'}
                            onClick={() => setUnitAddMode('manual')}
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                          >
                            Single Unit
                          </button>
                          <button
                            type="button"
                            className={unitAddMode === 'csv' ? 'portal-primary-btn' : 'portal-ghost-btn'}
                            onClick={() => setUnitAddMode('csv')}
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                          >
                            📁 Upload CSV
                          </button>
                        </div>
                      </div>

                      {unitAddMode === 'csv' ? (
                        <CsvUnitUploader
                          blocks={dashboard.projects.flatMap((p) =>
                            (p.blocks || []).map((b) => ({
                              id: b.id,
                              blockName: `${p.code} - Block ${b.blockName}`,
                            })),
                          )}
                          token={token}
                          isAdmin={isAdmin}
                          onSuccess={async () => {
                            await refreshDashboard(token, profile);
                          }}
                          setMutationMessage={setMutationMessage}
                        />
                      ) : (
                        <form className="portal-entity-form" onSubmit={onCreateUnit}>
                          <label>
                            <span>Block</span>
                            <select
                              value={unitForm.blockId}
                              onChange={(event) => setUnitForm((prev) => ({ ...prev, blockId: event.target.value }))}
                              required
                            >
                              <option value="">Select block</option>
                              {blockOptions.map((block) => (
                                <option key={block.id} value={block.id}>
                                  {block.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Unit Number</span>
                            <input
                              value={unitForm.unitNumber}
                              onChange={(event) =>
                                setUnitForm((prev) => ({ ...prev, unitNumber: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Floor</span>
                              <input
                                type="number"
                                value={unitForm.floorNumber}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, floorNumber: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              <span>Status</span>
                              <select
                                value={unitForm.status}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({
                                    ...prev,
                                    status: event.target.value as Unit['status'],
                                  }))
                                }
                              >
                                <option value="AVAILABLE">AVAILABLE</option>
                                <option value="RESERVED">RESERVED</option>
                                <option value="SOLD">SOLD</option>
                                <option value="RENTED">RENTED</option>
                                <option value="BLOCKED">BLOCKED</option>
                              </select>
                            </label>
                          </div>
                          <div className="portal-entity-grid-3">
                            <label>
                              <span>Size (sqm)</span>
                              <input
                                value={unitForm.sizeSqm}
                                onChange={(event) => setUnitForm((prev) => ({ ...prev, sizeSqm: event.target.value }))}
                                required
                              />
                            </label>
                            <label>
                              <span>Price KES</span>
                              <input
                                value={unitForm.priceKes}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, priceKes: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              <span>Price USD</span>
                              <input
                                value={unitForm.priceUsd}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, priceUsd: event.target.value }))
                                }
                                required
                              />
                            </label>
                          </div>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Bedrooms</span>
                              <input
                                type="number"
                                min={0}
                                value={unitForm.bedrooms}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, bedrooms: event.target.value }))
                                }
                              />
                            </label>
                            <label>
                              <span>Parking Slots</span>
                              <input
                                type="number"
                                min={0}
                                value={unitForm.parkingSlots}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, parkingSlots: event.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <div className="portal-check-row">
                            <label className="portal-check">
                              <input
                                type="checkbox"
                                checked={unitForm.hasBalcony}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, hasBalcony: event.target.checked }))
                                }
                              />
                              <span>Has Balcony</span>
                            </label>
                            <label className="portal-check">
                              <input
                                type="checkbox"
                                checked={unitForm.hasStore}
                                onChange={(event) =>
                                  setUnitForm((prev) => ({ ...prev, hasStore: event.target.checked }))
                                }
                              />
                              <span>Has Store</span>
                            </label>
                          </div>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Create Unit'}
                          </button>
                        </form>
                      )}
                    </article>
                  ) : null}

                  <article className="portal-card">
                    <h2>Units</h2>
                    <div className="portal-list-stack">
                      {dashboard.units.map((unit) => (
                        <div key={unit.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{unit.unitNumber}</strong>
                              <p>
                                Floor {unit.floorNumber} | {unit.bedrooms} bed | {unit.sizeSqm} sqm | Parking {unit.parkingSlots}
                              </p>
                            </div>
                            <span>{unit.status}</span>
                            <span>{formatCurrencyKes(unit.priceKes)}</span>
                          </div>

                          <div className="portal-action-row">
                            <Link href={`/portal/units/${unit.id}`} className="portal-inline-btn">
                              View Unit
                            </Link>
                            {isAdmin ? (
                              <>
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => {
                                    setEditingUnitId(unit.id);
                                    setUnitEditForm(makeUnitForm(unit));
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() => void onDeleteUnit(unit.id)}
                                >
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </div>

                          {editingUnitId === unit.id ? (
                            <form className="portal-entity-form portal-inline-form" onSubmit={onUpdateUnit}>
                              <label>
                                <span>Block</span>
                                <select
                                  value={unitEditForm.blockId}
                                  onChange={(event) =>
                                    setUnitEditForm((prev) => ({ ...prev, blockId: event.target.value }))
                                  }
                                  required
                                >
                                  <option value="">Select block</option>
                                  {blockOptions.map((block) => (
                                    <option key={block.id} value={block.id}>
                                      {block.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Unit Number</span>
                                <input
                                  value={unitEditForm.unitNumber}
                                  onChange={(event) =>
                                    setUnitEditForm((prev) => ({ ...prev, unitNumber: event.target.value }))
                                  }
                                  required
                                />
                              </label>
                              <div className="portal-entity-grid-2">
                                <label>
                                  <span>Floor</span>
                                  <input
                                    type="number"
                                    value={unitEditForm.floorNumber}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, floorNumber: event.target.value }))
                                    }
                                    required
                                  />
                                </label>
                                <label>
                                  <span>Status</span>
                                  <select
                                    value={unitEditForm.status}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({
                                        ...prev,
                                        status: event.target.value as Unit['status'],
                                      }))
                                    }
                                  >
                                    <option value="AVAILABLE">AVAILABLE</option>
                                    <option value="RESERVED">RESERVED</option>
                                    <option value="SOLD">SOLD</option>
                                    <option value="RENTED">RENTED</option>
                                    <option value="BLOCKED">BLOCKED</option>
                                  </select>
                                </label>
                              </div>
                              <div className="portal-entity-grid-3">
                                <label>
                                  <span>Size (sqm)</span>
                                  <input
                                    value={unitEditForm.sizeSqm}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, sizeSqm: event.target.value }))
                                    }
                                    required
                                  />
                                </label>
                                <label>
                                  <span>Price KES</span>
                                  <input
                                    value={unitEditForm.priceKes}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, priceKes: event.target.value }))
                                    }
                                    required
                                  />
                                </label>
                                <label>
                                  <span>Price USD</span>
                                  <input
                                    value={unitEditForm.priceUsd}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, priceUsd: event.target.value }))
                                    }
                                    required
                                  />
                                </label>
                              </div>
                              <div className="portal-entity-grid-2">
                                <label>
                                  <span>Bedrooms</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={unitEditForm.bedrooms}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, bedrooms: event.target.value }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Parking Slots</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={unitEditForm.parkingSlots}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, parkingSlots: event.target.value }))
                                    }
                                  />
                                </label>
                              </div>
                              <div className="portal-check-row">
                                <label className="portal-check">
                                  <input
                                    type="checkbox"
                                    checked={unitEditForm.hasBalcony}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, hasBalcony: event.target.checked }))
                                    }
                                  />
                                  <span>Has Balcony</span>
                                </label>
                                <label className="portal-check">
                                  <input
                                    type="checkbox"
                                    checked={unitEditForm.hasStore}
                                    onChange={(event) =>
                                      setUnitEditForm((prev) => ({ ...prev, hasStore: event.target.checked }))
                                    }
                                  />
                                  <span>Has Store</span>
                                </label>
                              </div>
                              <div className="portal-inline-actions">
                                <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="portal-ghost-btn"
                                  onClick={() => setEditingUnitId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                  </section>
                </>
              ) : null}

              {tab === 'customers' ? (
                <section className="portal-stack-grid">
                  <article className="portal-card">
                    <div className="portal-card-header-row">
                      <div>
                        <h2 style={{ margin: 0 }}>Customers</h2>
                        <p className="portal-muted">
                          Showing {filteredCustomers.length} of {dashboard.customers.length} customer
                          {dashboard.customers.length === 1 ? '' : 's'}.
                        </p>
                      </div>
                      {isAdmin || hasPermission(profile, 'customer.create') ? (
                        <Link href="/portal/customers/new" className="portal-primary-btn">
                          New Customer
                        </Link>
                      ) : null}
                    </div>

                    <div className="portal-filter-bar">
                      <label className="portal-filter-search">
                        <span>Search</span>
                        <input
                          type="search"
                          value={customerSearch}
                          onChange={(event) => setCustomerSearch(event.target.value)}
                          placeholder="Name, email, phone, or ID"
                        />
                      </label>
                      <label>
                        <span>Ownership</span>
                        <select
                          value={customerOwnershipFilter}
                          onChange={(event) =>
                            setCustomerOwnershipFilter(event.target.value as 'all' | 'owners' | 'non-owners')
                          }
                        >
                          <option value="all">All customers</option>
                          <option value="owners">Unit owners</option>
                          <option value="non-owners">Non-owners</option>
                        </select>
                      </label>
                      <label>
                        <span>Contracts</span>
                        <select
                          value={customerContractFilter}
                          onChange={(event) =>
                            setCustomerContractFilter(event.target.value as 'all' | 'buyers' | 'non-buyers')
                          }
                        >
                          <option value="all">All contracts</option>
                          <option value="buyers">Primary buyers</option>
                          <option value="non-buyers">No contracts</option>
                        </select>
                      </label>
                      <label>
                        <span>Sort</span>
                        <select
                          value={customerSort}
                          onChange={(event) =>
                            setCustomerSort(event.target.value as 'name-asc' | 'name-desc' | 'email-asc')
                          }
                        >
                          <option value="name-asc">Name A–Z</option>
                          <option value="name-desc">Name Z–A</option>
                          <option value="email-asc">Email A–Z</option>
                        </select>
                      </label>
                      {customerSearch ||
                      customerOwnershipFilter !== 'all' ||
                      customerContractFilter !== 'all' ||
                      customerSort !== 'name-asc' ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => {
                            setCustomerSearch('');
                            setCustomerOwnershipFilter('all');
                            setCustomerContractFilter('all');
                            setCustomerSort('name-asc');
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <div className="portal-list-stack" style={{ marginTop: 16 }}>
                      {dashboard.customers.length === 0 ? (
                        <div className="portal-empty-state">No customers yet.</div>
                      ) : filteredCustomers.length === 0 ? (
                        <div className="portal-empty-state">No customers match your search or filters.</div>
                      ) : (
                        filteredCustomers.map((customer) => {
                          const isOwner = ownerCustomerIds.has(customer.id);
                          const isBuyer = buyerCustomerIds.has(customer.id);

                          return (
                            <div key={customer.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>
                                    {customer.firstName} {customer.lastName}
                                  </strong>
                                  <p>{customer.email}</p>
                                  <p>
                                    {[isOwner ? 'Owner' : null, isBuyer ? 'Buyer' : null]
                                      .filter(Boolean)
                                      .join(' • ') || 'No ownership or sales link'}
                                  </p>
                                </div>
                                <span>{customer.phone}</span>
                                <span>{customer.nationalIdPassport}</span>
                              </div>

                              <div className="portal-action-row">
                                <Link href={`/portal/customers/${customer.id}`} className="portal-inline-btn">
                                  View Profile
                                </Link>
                                {isAdmin || hasPermission(profile, 'customer.update') ? (
                                  <Link
                                    href={`/portal/customers/${customer.id}/edit`}
                                    className="portal-inline-btn"
                                  >
                                    Edit
                                  </Link>
                                ) : null}
                                {isAdmin || hasPermission(profile, 'customer.delete') ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    onClick={() => void onDeleteCustomer(customer.id)}
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
                </section>
              ) : null}

              {tab === 'operations' ? (
                <section className="portal-stack-grid">
                  <div className="portal-section-grid">
                    {isAdmin ? (
                      <article className="portal-card">
                        <h2>Create Project Block</h2>
                        <form className="portal-entity-form" onSubmit={onCreateBlock}>
                          <label>
                            <span>Project</span>
                            <select
                              value={blockForm.projectId}
                              onChange={(event) =>
                                setBlockForm((prev) => ({ ...prev, projectId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select project</option>
                              {projectOptions.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Block Name</span>
                              <input
                                value={blockForm.blockName}
                                onChange={(event) =>
                                  setBlockForm((prev) => ({ ...prev, blockName: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              <span>Total Floors</span>
                              <input
                                type="number"
                                min={1}
                                value={blockForm.totalFloors}
                                onChange={(event) =>
                                  setBlockForm((prev) => ({ ...prev, totalFloors: event.target.value }))
                                }
                                required
                              />
                            </label>
                          </div>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Create Block'}
                          </button>
                        </form>
                      </article>
                    ) : null}

                    <article className="portal-card">
                      <h2>Project Blocks</h2>
                      <div className="portal-list-stack">
                        {dashboard.blocks.map((block) => (
                          <div key={block.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>Block {block.blockName}</strong>
                                <p>Project ID: {block.projectId}</p>
                              </div>
                              <span>Floors</span>
                              <span>{block.totalFloors}</span>
                            </div>
                            {isAdmin ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() => void onDeleteBlock(block.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  <div className="portal-section-grid">
                    {isAdmin ? (
                      <article className="portal-card">
                        <h2>Assign Unit to Customer</h2>
                        <form className="portal-entity-form" onSubmit={onCreateOwnership}>
                          <label>
                            <span>Unit</span>
                            <select
                              value={ownershipForm.unitId}
                              onChange={(event) =>
                                setOwnershipForm((prev) => ({ ...prev, unitId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select unit</option>
                              {unitOptions.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Customer</span>
                            <select
                              value={ownershipForm.customerId}
                              onChange={(event) =>
                                setOwnershipForm((prev) => ({ ...prev, customerId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select customer</option>
                              {customerOptions.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                  {customer.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Ownership %</span>
                              <input
                                value={ownershipForm.ownershipPercentage}
                                onChange={(event) =>
                                  setOwnershipForm((prev) => ({
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
                                checked={ownershipForm.isPrimaryOwner}
                                onChange={(event) =>
                                  setOwnershipForm((prev) => ({ ...prev, isPrimaryOwner: event.target.checked }))
                                }
                              />
                              <span>Primary Owner</span>
                            </label>
                          </div>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Assign Ownership'}
                          </button>
                        </form>
                      </article>
                    ) : null}

                    <article className="portal-card">
                      <h2>Unit Ownerships</h2>
                      <div className="portal-list-stack">
                        {dashboard.ownerships.map((ownership) => (
                          <div key={ownership.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>
                                  {unitOptions.find((unit) => unit.id === ownership.unitId)?.label || ownership.unitId}
                                </strong>
                                <p>
                                  Owner:{' '}
                                  {customerOptions.find((customer) => customer.id === ownership.customerId)?.label ||
                                    ownership.customerId}
                                </p>
                              </div>
                              <span>{ownership.isPrimaryOwner ? 'PRIMARY' : 'SECONDARY'}</span>
                              <span>{ownership.ownershipPercentage}%</span>
                            </div>
                            {isAdmin ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() => void onDeleteOwnership(ownership.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                </section>
              ) : null}

              {tab === 'finance' ? (
                <section className="portal-stack-grid">
                  <RentalCollectionsPanel token={token} canRead={hasPermission(profile, 'rental-payment.read')} />

                  <div className="portal-section-grid">
                    {isAdmin ? (
                      <article className="portal-card">
                        <h2>Create Sales Contract</h2>
                        <form className="portal-entity-form" onSubmit={onCreateContract}>
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
                            <span>Unit</span>
                            <select
                              value={contractForm.unitId}
                              onChange={(event) =>
                                setContractForm((prev) => ({ ...prev, unitId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select unit</option>
                              {unitOptions.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.label}
                                </option>
                              ))}
                            </select>
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
                              {customerOptions.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                  {customer.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="portal-entity-grid-3">
                            <label>
                              <span>Currency</span>
                              <select
                                value={contractForm.currency}
                                onChange={(event) =>
                                  setContractForm((prev) => ({ ...prev, currency: event.target.value }))
                                }
                                required
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
                            <label>
                              <span>Status</span>
                              <select
                                value={contractForm.contractStatus}
                                onChange={(event) =>
                                  setContractForm((prev) => ({ ...prev, contractStatus: event.target.value }))
                                }
                                required
                              >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="PENDING">PENDING</option>
                                <option value="COMPLETED">COMPLETED</option>
                                <option value="CANCELLED">CANCELLED</option>
                              </select>
                            </label>
                          </div>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Create Contract'}
                          </button>
                        </form>
                      </article>
                    ) : null}

                    <article className="portal-card">
                      <h2>Sales Contracts</h2>
                      <div className="portal-list-stack">
                        {dashboard.contracts.map((contract) => (
                          <div key={contract.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>{contract.contractNumber}</strong>
                                <p>
                                  Unit: {unitOptions.find((unit) => unit.id === contract.unitId)?.label || contract.unitId}
                                </p>
                              </div>
                              <span>{contract.contractStatus}</span>
                              <span>{formatCurrencyKes(contract.totalAgreedPrice)}</span>
                            </div>
                            {isAdmin ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() => void onDeleteContract(contract.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  <div className="portal-section-grid">
                    {isAdmin ? (
                      <article className="portal-card">
                        <h2>Create Customer Payment</h2>
                        <form className="portal-entity-form" onSubmit={onCreatePayment}>
                          <label>
                            <span>Receipt Number</span>
                            <input
                              value={paymentForm.receiptNumber}
                              onChange={(event) =>
                                setPaymentForm((prev) => ({ ...prev, receiptNumber: event.target.value }))
                              }
                              required
                            />
                          </label>
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
                              {contractOptions.map((contract) => (
                                <option key={contract.id} value={contract.id}>
                                  {contract.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="portal-entity-grid-2">
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
                                required
                              >
                                <option value="KES">KES</option>
                                <option value="USD">USD</option>
                              </select>
                            </label>
                          </div>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Payment Method</span>
                              <select
                                value={paymentForm.paymentMethod}
                                onChange={(event) =>
                                  setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
                                }
                                required
                              >
                                <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                                <option value="CASH">CASH</option>
                                <option value="CARD">CARD</option>
                                <option value="CHEQUE">CHEQUE</option>
                                <option value="MOBILE_MONEY">MOBILE_MONEY</option>
                              </select>
                            </label>
                            <label>
                              <span>Transaction Reference</span>
                              <input
                                value={paymentForm.transactionReference}
                                onChange={(event) =>
                                  setPaymentForm((prev) => ({
                                    ...prev,
                                    transactionReference: event.target.value,
                                  }))
                                }
                                required
                              />
                            </label>
                          </div>
                          <label>
                            <span>Payment Date (Optional)</span>
                            <input
                              type="date"
                              value={paymentForm.paymentDate}
                              onChange={(event) =>
                                setPaymentForm((prev) => ({ ...prev, paymentDate: event.target.value }))
                              }
                            />
                          </label>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Create Payment'}
                          </button>
                        </form>
                      </article>
                    ) : null}

                    <article className="portal-card">
                      <h2>Customer Payments</h2>
                      <div className="portal-list-stack">
                        {dashboard.payments.map((payment) => (
                          <div key={payment.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>{payment.receiptNumber}</strong>
                                <p>{payment.transactionReference}</p>
                              </div>
                              <span>{payment.currency}</span>
                              <span>{formatCurrencyKes(payment.amountPaid)}</span>
                            </div>
                            {isAdmin ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() => void onDeletePayment(payment.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  <div className="portal-section-grid">
                    {isAdmin ? (
                      <article className="portal-card">
                        <h2>Create Reallocation Audit</h2>
                        <form className="portal-entity-form" onSubmit={onCreateAudit}>
                          <label>
                            <span>Payment</span>
                            <select
                              value={auditForm.paymentId}
                              onChange={(event) =>
                                setAuditForm((prev) => ({ ...prev, paymentId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select payment</option>
                              {paymentOptions.map((payment) => (
                                <option key={payment.id} value={payment.id}>
                                  {payment.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Source Contract (Optional)</span>
                              <select
                                value={auditForm.sourceContractId}
                                onChange={(event) =>
                                  setAuditForm((prev) => ({ ...prev, sourceContractId: event.target.value }))
                                }
                              >
                                <option value="">None</option>
                                {contractOptions.map((contract) => (
                                  <option key={contract.id} value={contract.id}>
                                    {contract.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Destination Contract (Optional)</span>
                              <select
                                value={auditForm.destinationContractId}
                                onChange={(event) =>
                                  setAuditForm((prev) => ({ ...prev, destinationContractId: event.target.value }))
                                }
                              >
                                <option value="">None</option>
                                {contractOptions.map((contract) => (
                                  <option key={contract.id} value={contract.id}>
                                    {contract.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label>
                            <span>Reallocated Amount</span>
                            <input
                              value={auditForm.reallocatedAmount}
                              onChange={(event) =>
                                setAuditForm((prev) => ({ ...prev, reallocatedAmount: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label>
                            <span>Reason</span>
                            <input
                              value={auditForm.reason}
                              onChange={(event) => setAuditForm((prev) => ({ ...prev, reason: event.target.value }))}
                              required
                            />
                          </label>
                          <label>
                            <span>Reallocated By</span>
                            <input
                              value={auditForm.reallocatedBy}
                              onChange={(event) =>
                                setAuditForm((prev) => ({ ...prev, reallocatedBy: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Create Audit'}
                          </button>
                        </form>
                      </article>
                    ) : null}

                    <article className="portal-card">
                      <h2>Reallocation Audits</h2>
                      <div className="portal-list-stack">
                        {dashboard.audits.map((audit) => (
                          <div key={audit.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>{audit.reason}</strong>
                                <p>By: {audit.reallocatedBy}</p>
                              </div>
                              <span>{audit.timestamp ? new Date(audit.timestamp).toLocaleDateString() : '-'}</span>
                              <span>{formatCurrencyKes(audit.reallocatedAmount)}</span>
                            </div>
                            {isAdmin ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() => void onDeleteAudit(audit.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                </section>
              ) : null}

              {tab === 'analytics' ? (
                <section className="portal-stack-grid">
                  <article className="portal-card">
                    <h2>Portfolio Analytics</h2>
                    <div className="portal-stats-grid">
                      <article className="portal-card portal-stat-card">
                        <p>Total Contract Value</p>
                        <h3>{formatCurrencyKes(analytics.totalContractValue)}</h3>
                      </article>
                      <article className="portal-card portal-stat-card">
                        <p>Total Collected</p>
                        <h3>{formatCurrencyKes(analytics.totalCollected)}</h3>
                      </article>
                      <article className="portal-card portal-stat-card">
                        <p>Outstanding Balance</p>
                        <h3>{formatCurrencyKes(analytics.outstandingBalance)}</h3>
                      </article>
                      <article className="portal-card portal-stat-card">
                        <p>Collection Rate</p>
                        <h3>{analytics.collectionRate.toFixed(1)}%</h3>
                      </article>
                    </div>
                  </article>

                  <div className="portal-data-grid">
                    <article className="portal-card">
                      <h2>Unit Status Mix</h2>
                      <div className="portal-list-stack">
                        {Object.keys(analytics.statusCounts).length === 0 ? (
                          <div className="portal-empty-state">No unit status data available.</div>
                        ) : (
                          Object.entries(analytics.statusCounts).map(([status, count]) => (
                            <div key={status} className="portal-list-row">
                              <div>
                                <strong>{status}</strong>
                                <p>Units in this status</p>
                              </div>
                              <span>{count}</span>
                              <span>
                                {stats.unitCount > 0 ? `${((count / stats.unitCount) * 100).toFixed(1)}%` : '0.0%'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </article>

                    <article className="portal-card">
                      <h2>Payment Method Mix</h2>
                      <div className="portal-list-stack">
                        {Object.keys(analytics.paymentsByMethod).length === 0 ? (
                          <div className="portal-empty-state">No payment records available.</div>
                        ) : (
                          Object.entries(analytics.paymentsByMethod).map(([method, count]) => (
                            <div key={method} className="portal-list-row">
                              <div>
                                <strong>{method}</strong>
                                <p>Recorded payments</p>
                              </div>
                              <span>{count}</span>
                              <span>
                                {stats.paymentCount > 0 ? `${((count / stats.paymentCount) * 100).toFixed(1)}%` : '0.0%'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  </div>

                  <article className="portal-card">
                    <h2>Ownership Coverage</h2>
                    <div className="portal-payment-summary-grid">
                      <div>
                        <span>Units With Owners</span>
                        <strong>
                          {analytics.unitsWithOwnership} / {stats.unitCount}
                        </strong>
                      </div>
                      <div>
                        <span>Coverage Rate</span>
                        <strong>{analytics.ownershipCoverage.toFixed(1)}%</strong>
                      </div>
                    </div>
                    <div className="portal-progress-track">
                      <div className="portal-progress-fill" style={{ width: `${Math.min(analytics.ownershipCoverage, 100)}%` }} />
                    </div>
                  </article>
                </section>
              ) : null}

              {tab === 'rbac' ? (
                <section className="portal-stack-grid">
                  {!canReadRbac ? (
                    <article className="portal-card portal-role-banner">
                      You do not have permission to view RBAC records.
                    </article>
                  ) : (
                    <>
                      <div className="portal-data-grid portal-rbac-summary-grid">
                        <article className="portal-card portal-stat-card">
                          <p>Roles</p>
                          <h3>{rbac.roles.length}</h3>
                        </article>
                        <article className="portal-card portal-stat-card">
                          <p>Permissions</p>
                          <h3>{rbac.permissions.length}</h3>
                        </article>
                        <article className="portal-card portal-stat-card">
                          <p>Users</p>
                          <h3>{rbac.users.length}</h3>
                        </article>
                        <article className="portal-card portal-stat-card">
                          <p>Your Effective Roles</p>
                          <h3>{profile.roles.length}</h3>
                        </article>
                      </div>

                      <article className="portal-card portal-rbac-nav-card">
                        <div className="portal-card-header-row">
                          <div>
                            <h2>RBAC Workspace</h2>
                            <p className="portal-muted">
                              Keep the landing page focused on role discovery, then move into dedicated screens for authoring and assignment.
                            </p>
                          </div>
                          <div className="portal-action-row portal-rbac-nav-actions">
                            <Link href="/portal/rbac" className={!rbacCreateMode && !rbacUsersMode && !isRbacEditView ? 'portal-inline-btn is-active' : 'portal-inline-btn'}>
                              Roles
                            </Link>
                            {canManageRoles ? (
                              <Link href="/portal/rbac/new" className={rbacCreateMode ? 'portal-inline-btn is-active' : 'portal-inline-btn'}>
                                Create Role
                              </Link>
                            ) : null}
                            {canManageUsers || hasPermission(profile, 'user.read') ? (
                              <Link href="/portal/users" className="portal-inline-btn">
                                Manage Users
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </article>

                      {!rbacCreateMode && !rbacUsersMode && !isRbacEditView ? (
                        <div className="portal-data-grid portal-rbac-landing-grid">
                          <article className="portal-card">
                            <div className="portal-card-header-row">
                              <div>
                                <h2>Roles</h2>
                                <p className="portal-muted">
                                  Browse system and custom roles. Use the separate editor screen when you need to compose large permission sets.
                                </p>
                              </div>
                              {canManageRoles ? (
                                <Link href="/portal/rbac/new" className="portal-primary-btn portal-link-btn">
                                  New Role
                                </Link>
                              ) : null}
                            </div>

                            <div className="portal-list-stack">
                              {rbac.roles.map((role) => (
                                <div key={role.id} className="portal-record portal-rbac-role-record">
                                  <div className="portal-list-row portal-rbac-row">
                                    <div>
                                      <strong>{role.name}</strong>
                                      <p>{role.description || 'No description provided.'}</p>
                                    </div>
                                    <span>{role.isSystem ? 'SYSTEM' : 'CUSTOM'}</span>
                                    <span>{role.permissions.length} permissions</span>
                                  </div>
                                  <div className="portal-rbac-meta-grid">
                                    <div>
                                      <span>Created</span>
                                      <strong>{formatDateTime(role.createdAt)}</strong>
                                    </div>
                                    <div>
                                      <span>Updated</span>
                                      <strong>{formatDateTime(role.updatedAt)}</strong>
                                    </div>
                                  </div>
                                  <div className="portal-permission-summary-grid">
                                    {Object.entries(
                                      role.permissions.reduce<Record<string, number>>((accumulator, permission) => {
                                        accumulator[permission.subject] = (accumulator[permission.subject] || 0) + 1;
                                        return accumulator;
                                      }, {}),
                                    )
                                      .sort(([left], [right]) => left.localeCompare(right))
                                      .map(([subject, count]) => (
                                        <div key={subject} className="portal-permission-summary-item">
                                          <span>{subject}</span>
                                          <strong>{count}</strong>
                                        </div>
                                      ))}
                                  </div>
                                  <div className="portal-action-row">
                                    <Link href={`/portal/rbac/${role.id}/edit`} className="portal-inline-btn">
                                      View & Edit
                                    </Link>
                                    {!role.isSystem && hasPermission(profile, 'role.delete') ? (
                                      <button
                                        type="button"
                                        className="portal-inline-btn is-danger"
                                        onClick={() => void onDeleteRole(role.id)}
                                      >
                                        Delete
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>

                          <article className="portal-card">
                            <h2>Permission Density Map</h2>
                            <p className="portal-muted">
                              Hundreds of permissions stay readable here by compressing them into a subject matrix instead of rendering every key as a large chip.
                            </p>
                            <div className="portal-permission-subject-table">
                              {Object.entries(permissionGroups).map(([subject, permissions]) => (
                                <div key={subject} className="portal-permission-subject-row">
                                  <div>
                                    <strong>{subject}</strong>
                                    <p>{permissions.length} generated permissions</p>
                                  </div>
                                  <div className="portal-permission-token-row">
                                    {permissions.map((permission) => (
                                      <span key={permission.id} className="portal-chip is-dense">
                                        {permission.action}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        </div>
                      ) : null}

                      {(rbacCreateMode || isRbacEditView) && canManageRoles ? (
                        <div className="portal-data-grid portal-rbac-editor-grid">
                          <article className="portal-card">
                            <div className="portal-card-header-row">
                              <div>
                                <h2>{isRbacEditView ? 'Edit Role' : 'Create Role'}</h2>
                                <p className="portal-muted">
                                  Compose permissions in a compact matrix optimized for large catalogs.
                                </p>
                              </div>
                              <div className="portal-action-row">
                                <Link href="/portal/rbac" className="portal-inline-btn">
                                  Back to Roles
                                </Link>
                              </div>
                            </div>

                            {isRbacEditView && !editingRole ? (
                              <div className="portal-empty-state">Role not found for this edit route.</div>
                            ) : (
                              <form className="portal-entity-form" onSubmit={onSubmitRole}>
                                <div className="portal-entity-grid-2">
                                  <label>
                                    <span>Role Name</span>
                                    <input
                                      value={roleForm.name}
                                      onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
                                      required
                                    />
                                  </label>
                                  <label>
                                    <span>Description</span>
                                    <input
                                      value={roleForm.description}
                                      onChange={(event) =>
                                        setRoleForm((prev) => ({ ...prev, description: event.target.value }))
                                      }
                                    />
                                  </label>
                                </div>

                                <div className="portal-permission-grid-dense">
                                  {Object.entries(permissionGroups).map(([subject, permissions]) => (
                                    <fieldset key={subject} className="portal-permission-group portal-permission-group-dense">
                                      <legend>{subject}</legend>
                                      <div className="portal-selection-grid portal-selection-grid-dense">
                                        {permissions.map((permission) => (
                                          <label key={permission.id} className="portal-selection-chip portal-selection-chip-dense">
                                            <input
                                              type="checkbox"
                                              checked={roleForm.permissionIds.includes(permission.id)}
                                              onChange={() =>
                                                setRoleForm((prev) => ({
                                                  ...prev,
                                                  permissionIds: toggleSelection(prev.permissionIds, permission.id),
                                                }))
                                              }
                                            />
                                            <span>{permission.action}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </fieldset>
                                  ))}
                                </div>

                                <div className="portal-inline-actions">
                                  <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                    {mutating ? 'Saving...' : isRbacEditView ? 'Save Role' : 'Create Role'}
                                  </button>
                                  <Link href="/portal/rbac" className="portal-ghost-btn portal-link-btn">
                                    Cancel
                                  </Link>
                                </div>
                              </form>
                            )}
                          </article>

                          <article className="portal-card">
                            <h2>Selection Summary</h2>
                            <div className="portal-rbac-meta-grid">
                              <div>
                                <span>Selected Permissions</span>
                                <strong>{roleForm.permissionIds.length}</strong>
                              </div>
                              <div>
                                <span>Subjects Covered</span>
                                <strong>
                                  {
                                    new Set(
                                      rbac.permissions
                                        .filter((permission) => roleForm.permissionIds.includes(permission.id))
                                        .map((permission) => permission.subject),
                                    ).size
                                  }
                                </strong>
                              </div>
                            </div>
                            <div className="portal-permission-subject-table">
                              {Object.entries(permissionGroups).map(([subject, permissions]) => {
                                const selected = permissions.filter((permission) => roleForm.permissionIds.includes(permission.id));
                                if (!selected.length) {
                                  return null;
                                }

                                return (
                                  <div key={subject} className="portal-permission-subject-row">
                                    <div>
                                      <strong>{subject}</strong>
                                      <p>{selected.length} selected</p>
                                    </div>
                                    <div className="portal-permission-token-row">
                                      {selected.map((permission) => (
                                        <span key={permission.id} className="portal-chip is-dense">
                                          {permission.action}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        </div>
                      ) : null}

                      {rbacUsersMode && canManageUsers ? (
                        <div className="portal-data-grid portal-rbac-landing-grid">
                          <article className="portal-card">
                            <div className="portal-card-header-row">
                              <div>
                                <h2>User Role Assignment</h2>
                                <p className="portal-muted">
                                  Assign business roles from a dedicated workspace without crowding the main roles landing page.
                                </p>
                              </div>
                              <Link href="/portal/rbac" className="portal-inline-btn">
                                Back to Roles
                              </Link>
                            </div>

                            <form className="portal-entity-form portal-detail-form" onSubmit={onAssignUserRoles}>
                              <label>
                                <span>User</span>
                                <select
                                  value={userRoleForm.userId}
                                  onChange={(event) => onSelectUserForRoleAssignment(event.target.value)}
                                  required
                                >
                                  <option value="">Select user</option>
                                  {rbac.users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.email}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="portal-selection-grid portal-selection-grid-roles">
                                {rbac.roles.map((role) => (
                                  <label key={role.id} className="portal-selection-chip">
                                    <input
                                      type="checkbox"
                                      checked={userRoleForm.roleIds.includes(role.id)}
                                      onChange={() =>
                                        setUserRoleForm((prev) => ({
                                          ...prev,
                                          roleIds: toggleSelection(prev.roleIds, role.id),
                                        }))
                                      }
                                    />
                                    <span>{role.name}</span>
                                  </label>
                                ))}
                              </div>

                              <button type="submit" className="portal-primary-btn" disabled={mutating || !userRoleForm.userId}>
                                {mutating ? 'Saving...' : 'Assign Roles'}
                              </button>
                            </form>

                            {selectedUser ? (
                              <div className="portal-card portal-rbac-preview-card">
                                <p className="portal-kicker">Selected User</p>
                                <h3>{selectedUser.email}</h3>
                                <div className="portal-tag-cloud">
                                  {selectedUser.permissions.map((permission) => (
                                    <span key={permission} className="portal-chip is-dense">
                                      {permission}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </article>

                          <article className="portal-card">
                            <h2>Users</h2>
                            <div className="portal-list-stack">
                              {rbac.users.map((user) => (
                                <div key={user.id} className="portal-record">
                                  <div className="portal-list-row portal-rbac-row">
                                    <div>
                                      <strong>{user.name || user.email}</strong>
                                      <p>{user.email}</p>
                                    </div>
                                    <span>{user.roles.length} roles</span>
                                    <span>{user.permissions.length} permissions</span>
                                  </div>
                                  <div className="portal-tag-cloud">
                                    {user.roles.length ? (
                                      user.roles.map((role) => (
                                        <span key={role.id} className="portal-chip">
                                          {role.name}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="portal-muted">No roles assigned</span>
                                    )}
                                  </div>
                                  <div className="portal-action-row">
                                    <button
                                      type="button"
                                      className="portal-inline-btn"
                                      onClick={() => onSelectUserForRoleAssignment(user.id)}
                                    >
                                      Assign Roles
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}
            </PortalShell>
          </section>
        )}
      </main>
    </EliteLayout>
  );
}
