"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../../components/notifications';
import { ImagePicker } from '../../../components/image-picker';
import { formatSqft, sqftInputToSqm, sqmToSqftInput } from '../../../../lib/area';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../../../components/elite-layout';
import { PortalShell } from '../../../components/portal-shell';

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
  isFeatured?: boolean;
  featuredOrder?: number | null;
  floorPlanId?: string | null;
  bathrooms?: number;
  propertyType?: string | null;
  listingType?: string | null;
  referenceCode?: string | null;
  availableFrom?: string | null;
  furnishing?: string | null;
  lotSizeSqm?: string | number | null;
  extraDetails?: string | null;
  portfolio?: string | null;
  featuredImageUrl?: string | null;
  galleryImages?: string[] | null;
  floorPlanUrl?: string | null;
  block?: { id: string; blockName: string; projectId: string } | null;
};

type UnitFormState = {
  unitNumber: string;
  floorNumber: string;
  sizeSqm: string;
  /** Stored metric value the form loaded with; see sqftInputToSqm. */
  originalSizeSqm?: string | number | null;
  priceKes: string;
  priceUsd: string;
  status: Unit['status'];
  bedrooms: string;
  parkingSlots: string;
  hasBalcony: boolean;
  hasStore: boolean;
  isFeatured?: boolean;
  featuredOrder?: number | null;
  floorPlanId?: string;
  bathrooms?: string;
  propertyType?: string;
  listingType?: string;
  referenceCode?: string;
  availableFrom?: string;
  furnishing?: string;
  lotSizeSqm?: string;
  originalLotSizeSqm?: string | number | null;
  extraDetails?: string;
  portfolio?: string;
  featuredImageUrl: string;
  galleryImages: string[];
  floorPlanUrl: string;
};

type Tenancy = {
  id: string;
  unitId: string;
  tenantId: string;
  leaseStart: string;
  leaseEnd?: string | null;
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  monthlyRent: string | number;
  currency: string;
  depositAmount?: string | number | null;
  rentDueDay: number;
  notes?: string | null;
};

type UtilityCharge = {
  id: string;
  tenancyId: string;
  category: UtilityCategory;
  amount: string | number;
  dueDay?: number | null;
  isActive: boolean;
  notes?: string | null;
};

/**
 * RENT is intentionally absent -- rent is Tenancy.monthlyRent, and a second
 * source for it would double-bill the reminder engine.
 */
const UTILITY_CATEGORIES = [
  'WATER',
  'ELECTRICITY',
  'GARBAGE',
  'SECURITY',
  'INTERNET',
  'PARKING',
  'SERVICE_CHARGE',
  'OTHER',
] as const;

type UtilityCategory = (typeof UTILITY_CATEGORIES)[number];

type RentFormState = {
  monthlyRent: string;
  currency: string;
  depositAmount: string;
  rentDueDay: string;
};

type UtilityRow = {
  category: UtilityCategory;
  amount: string;
  dueDay: string;
  isActive: boolean;
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
    throw new Error((await response.text()) || `Request failed with status ${response.status}`);
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
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    throw new Error((await response.text()) || 'Upload failed');
  }
  return (await response.json()) as { objectKey: string; url: string };
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string) {
  if (!profile) return false;
  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) return true;
  return Boolean(profile.permissions?.includes(permission));
}

function stripGallery(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function makeForm(unit?: Unit | null): UnitFormState {
  const gallery = stripGallery(unit?.galleryImages);
  const featured = unit?.featuredImageUrl || '';
  const galleryWithFeatured = featured && !gallery.includes(featured) ? [featured, ...gallery] : gallery;

  return {
    unitNumber: unit?.unitNumber || '',
    floorNumber: unit ? String(unit.floorNumber) : '',
    sizeSqm: unit ? sqmToSqftInput(unit.sizeSqm) : '',
    originalSizeSqm: unit?.sizeSqm ?? null,
    priceKes: unit ? String(unit.priceKes) : '',
    priceUsd: unit ? String(unit.priceUsd) : '',
    status: unit?.status || 'AVAILABLE',
    bedrooms: unit ? String(unit.bedrooms) : '0',
    parkingSlots: unit ? String(unit.parkingSlots) : '0',
    hasBalcony: unit?.hasBalcony || false,
    hasStore: unit?.hasStore || false,
    isFeatured: unit?.isFeatured || false,
    floorPlanId: unit?.floorPlanId || '',
    bathrooms: String(unit?.bathrooms ?? 0),
    propertyType: unit?.propertyType || '',
    listingType: unit?.listingType || '',
    referenceCode: unit?.referenceCode || '',
    availableFrom: unit?.availableFrom ? String(unit.availableFrom).slice(0, 10) : '',
    furnishing: unit?.furnishing || '',
    lotSizeSqm: unit?.lotSizeSqm != null ? sqmToSqftInput(unit.lotSizeSqm) : '',
    originalLotSizeSqm: unit?.lotSizeSqm ?? null,
    extraDetails: unit?.extraDetails || '',
    portfolio: unit?.portfolio || '',
    featuredOrder: unit?.featuredOrder ?? null,
    featuredImageUrl: featured || galleryWithFeatured[0] || '',
    galleryImages: galleryWithFeatured,
    floorPlanUrl: unit?.floorPlanUrl || '',
  };
}

function makeRentForm(tenancy?: Tenancy | null): RentFormState {
  return {
    monthlyRent: tenancy ? String(tenancy.monthlyRent) : '',
    currency: tenancy?.currency || 'KES',
    depositAmount: tenancy?.depositAmount != null ? String(tenancy.depositAmount) : '',
    rentDueDay: tenancy ? String(tenancy.rentDueDay ?? 1) : '1',
  };
}

function makeUtilityRows(charges: UtilityCharge[]): UtilityRow[] {
  const byCategory = new Map<string, UtilityCharge>();
  for (const charge of charges) byCategory.set(charge.category, charge);

  // Every category gets a row so the grid is a stable, complete checklist. Rows
  // left blank are simply not sent on save.
  return UTILITY_CATEGORIES.map((category) => {
    const existing = byCategory.get(category);
    return {
      category,
      amount: existing ? String(existing.amount) : '',
      dueDay: existing?.dueDay != null ? String(existing.dueDay) : '',
      isActive: existing ? existing.isActive : true,
      notes: existing?.notes || '',
    };
  });
}

function formatCategory(category: string) {
  return category.replaceAll('_', ' ');
}

export default function UnitEditClient({ unitId }: { unitId: string }) {
  const router = useRouter();
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [floorPlanPickerOpen, setFloorPlanPickerOpen] = useState(false);
  const floorPlanInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [floorPlans, setFloorPlans] = useState<
    Array<{
      id: string;
      projectId: string;
      name: string;
      bedrooms: number;
      bathrooms?: number;
      sizeSqm: string | number;
      priceKes?: string | number | null;
      imageUrls?: string[] | null;
    }>
  >([]);
  // Kept out of form state: it identifies the unit's development rather than
  // being an editable field, and the plan picker and its links key off it.
  const [unitProjectId, setUnitProjectId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [form, setForm] = useState<UnitFormState>(makeForm());
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [rentForm, setRentForm] = useState<RentFormState>(makeRentForm());
  const [utilityRows, setUtilityRows] = useState<UtilityRow[]>(makeUtilityRows([]));
  const [savingRent, setSavingRent] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      const unit = await apiRequest<Unit>(`/units/${unitId}`, { method: 'GET' }, authToken);
      setProfile(nextProfile);
      setForm(makeForm(unit));
      setUnitProjectId(unit.block?.projectId || null);

      // Scoped to the unit's own project: plans belong to a development, and
      // offering another project's layouts here would only invite mis-assignment.
      if (unit.block?.projectId && hasPermission(nextProfile, 'floor-plan.read')) {
        try {
          setFloorPlans(
            await apiRequest<typeof floorPlans>(
              `/floor-plans?projectId=${unit.block.projectId}`,
              { method: 'GET' },
              authToken,
            ),
          );
        } catch {
          // A missing plan list must not block editing the unit.
          setFloorPlans([]);
        }
      }

      // Rent and utilities are a separate concern gated on tenancy.read, so a
      // failure here must not take the unit editor down with it.
      if (hasPermission(nextProfile, 'tenancy.read')) {
        try {
          const tenancies = await apiRequest<Tenancy[]>(
            `/tenancies?unitId=${unitId}&take=200`,
            { method: 'GET' },
            authToken,
          );
          const active =
            tenancies.find((item) => item.status === 'ACTIVE') || tenancies[0] || null;
          setTenancy(active);
          setRentForm(makeRentForm(active));

          if (active) {
            const charges = await apiRequest<UtilityCharge[]>(
              `/tenancies/${active.id}/utility-charges`,
              { method: 'GET' },
              authToken,
            );
            setUtilityRows(makeUtilityRows(charges));
          } else {
            setUtilityRows(makeUtilityRows([]));
          }
        } catch {
          setTenancy(null);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load unit.');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canUpdate = hasPermission(profile, 'unit.update');
  const canUpdateTenancy = hasPermission(profile, 'tenancy.update');
  const canReadTenancy = hasPermission(profile, 'tenancy.read');

  async function onSaveRentAndUtilities(): Promise<boolean> {
    if (!token || !tenancy || !canUpdateTenancy) return false;

    const dueDay = Number(rentForm.rentDueDay || 1);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setErrorMessage('Rent due day must be a whole number between 1 and 31.');
      return false;
    }

    const charges = [];
    for (const row of utilityRows) {
      if (!row.amount.trim()) continue;

      const amount = Number(row.amount);
      if (Number.isNaN(amount) || amount < 0) {
        setErrorMessage(`${formatCategory(row.category)} amount must be a positive number.`);
        return false;
      }

      let chargeDueDay: number | null = null;
      if (row.dueDay.trim()) {
        chargeDueDay = Number(row.dueDay);
        if (!Number.isInteger(chargeDueDay) || chargeDueDay < 1 || chargeDueDay > 31) {
          setErrorMessage(`${formatCategory(row.category)} due day must be between 1 and 31.`);
          return false;
        }
      }

      charges.push({
        category: row.category,
        // The API validates with @IsDecimal, which expects a string.
        amount: amount.toFixed(2),
        dueDay: chargeDueDay,
        isActive: row.isActive,
        notes: row.notes.trim() || null,
      });
    }

    setSavingRent(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      await apiRequest(
        `/tenancies/${tenancy.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            monthlyRent: Number(rentForm.monthlyRent || 0).toFixed(2),
            currency: rentForm.currency,
            depositAmount: rentForm.depositAmount.trim()
              ? Number(rentForm.depositAmount).toFixed(2)
              : undefined,
            rentDueDay: dueDay,
          }),
        },
        token,
      );

      const saved = await apiRequest<UtilityCharge[]>(
        `/tenancies/${tenancy.id}/utility-charges`,
        { method: 'PUT', body: JSON.stringify({ charges }) },
        token,
      );

      setUtilityRows(makeUtilityRows(saved));
      setFeedback('Rent and monthly charges updated.');
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save rent and charges.');
      return false;
    } finally {
      setSavingRent(false);
    }
  }
  const monthlyTotal = useMemo(() => {
    const rent = Number(rentForm.monthlyRent || 0);
    const utilities = utilityRows.reduce((sum, row) => {
      if (!row.isActive || !row.amount.trim()) return sum;
      const amount = Number(row.amount);
      return Number.isNaN(amount) ? sum : sum + amount;
    }, 0);
    return (Number.isNaN(rent) ? 0 : rent) + utilities;
  }, [rentForm.monthlyRent, utilityRows]);

  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  /**
   * Copies a plan's figures onto the unit.
   *
   * Unlike the create screen this is deliberately NOT run on selection. The
   * unit already has agreed figures -- a sold unit keeps what was advertised --
   * so changing the association must never silently rewrite price or size. The
   * operator asks for the copy when they actually want it.
   */
  function copyFromPlan() {
    const plan = floorPlans.find((entry) => entry.id === form.floorPlanId);
    if (!plan) return;
    setForm((prev) => ({
      ...prev,
      bedrooms: String(plan.bedrooms ?? prev.bedrooms),
      bathrooms: plan.bathrooms != null ? String(plan.bathrooms) : prev.bathrooms,
      sizeSqm: plan.sizeSqm != null ? sqmToSqftInput(plan.sizeSqm) : prev.sizeSqm,
      // The figure now comes from the plan, so the loaded-value guard no
      // longer applies -- this is a genuine change.
      originalSizeSqm: null,
      priceKes: plan.priceKes != null ? String(plan.priceKes) : prev.priceKes,
      floorPlanUrl: plan.imageUrls?.[0] || prev.floorPlanUrl,
    }));
    setFeedback('Figures copied from the plan. Review them, then save.');
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function addImageFiles(fileList: FileList | File[]) {
    if (!token) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setErrorMessage('Please drop image files only.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadMedia(file, token)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      if (!urls.length) return;

      setForm((prev) => {
        const galleryImages = [...prev.galleryImages, ...urls];
        const featuredImageUrl = prev.featuredImageUrl || urls[0];
        return { ...prev, galleryImages, featuredImageUrl };
      });
      setFeedback(`${urls.length} image${urls.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload images.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      void addImageFiles(event.dataTransfer.files);
    }
  }

  function removeImage(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.filter((image) => image !== url);
      const featuredImageUrl = prev.featuredImageUrl === url ? galleryImages[0] || '' : prev.featuredImageUrl;
      return { ...prev, galleryImages, featuredImageUrl };
    });
  }

  function setFeatured(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.includes(url) ? prev.galleryImages : [url, ...prev.galleryImages];
      return { ...prev, featuredImageUrl: url, galleryImages };
    });
    setFeedback('Featured photo updated.');
  }

  async function onFloorPlanSelected(file: File) {
    if (!token) return;
    setUploadingFloorPlan(true);
    setErrorMessage(null);
    try {
      const uploaded = await uploadMedia(file, token);
      setForm((prev) => ({ ...prev, floorPlanUrl: uploaded.url }));
      setFeedback('Floor plan uploaded.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload floor plan.');
    } finally {
      setUploadingFloorPlan(false);
    }
  }

  function removeFloorPlan() {
    setForm((prev) => ({ ...prev, floorPlanUrl: '' }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate) return;

    setSaving(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const galleryImages = [...form.galleryImages];
      if (form.featuredImageUrl && !galleryImages.includes(form.featuredImageUrl)) {
        galleryImages.unshift(form.featuredImageUrl);
      }

      await apiRequest(
        `/units/${unitId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            unitNumber: form.unitNumber.trim(),
            floorNumber: Number(form.floorNumber),
            sizeSqm: sqftInputToSqm(form.sizeSqm, form.originalSizeSqm),
            priceKes: form.priceKes,
            priceUsd: form.priceUsd,
            status: form.status,
            bedrooms: Number(form.bedrooms || 0),
            parkingSlots: Number(form.parkingSlots || 0),
            hasBalcony: form.hasBalcony,
            hasStore: form.hasStore,
            isFeatured: form.isFeatured || false,
            floorPlanId: form.floorPlanId || undefined,
            bathrooms: Number(form.bathrooms || 0),
            propertyType: form.propertyType || undefined,
            listingType: form.listingType || undefined,
            referenceCode: form.referenceCode || undefined,
            availableFrom: form.availableFrom || undefined,
            furnishing: form.furnishing || undefined,
            lotSizeSqm: form.lotSizeSqm
              ? sqftInputToSqm(form.lotSizeSqm, form.originalLotSizeSqm)
              : undefined,
            extraDetails: form.extraDetails || undefined,
            portfolio: form.portfolio || undefined,
            featuredOrder: form.featuredOrder ?? undefined,
            featuredImageUrl: form.featuredImageUrl || undefined,
            galleryImages,
            floorPlanUrl: form.floorPlanUrl || undefined,
          }),
        },
        token,
      );

      // Saving the unit navigates away, so flush any pending rent/utility edits
      // rather than silently dropping them.
      if (tenancy && canUpdateTenancy) {
        const saved = await onSaveRentAndUtilities();
        if (!saved) return;
      }

      setFeedback('Unit updated.');
      router.push(`/portal/units/${unitId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save unit.');
    } finally {
      setSaving(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading unit editor...</article>
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

  if (!canUpdate) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="units"
              pageTitle="Edit Unit"
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={hasPermission(profile, 'role.read')}
              onLogout={onLogout}
            >
              <article className="portal-card portal-role-banner">
                You do not have permission to update units.
              </article>
              <Link
                href={`/portal/units/${unitId}`}
                className="portal-ghost-btn"
                style={{ display: 'inline-flex', width: 'fit-content' }}
              >
                Back to Unit
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
            active="units"
            pageTitle="Edit Unit"
            pageSubtitle="Update unit details, upload the floor plan, and manage gallery photos. Nominate one photo as featured."
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
                  <h2 style={{ margin: 0 }}>Unit Details</h2>
                  <Link href={`/portal/units/${unitId}`} className="portal-inline-btn">
                    Cancel
                  </Link>
                </div>

                <div className="portal-entity-form">
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Unit Number</span>
                      <input
                        value={form.unitNumber}
                        onChange={(event) => setForm((prev) => ({ ...prev, unitNumber: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Floor Number</span>
                      <input
                        type="number"
                        value={form.floorNumber}
                        onChange={(event) => setForm((prev) => ({ ...prev, floorNumber: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Size (sq ft)</span>
                      <input
                        value={form.sizeSqm}
                        onChange={(event) => setForm((prev) => ({ ...prev, sizeSqm: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Price (KES)</span>
                      <input
                        value={form.priceKes}
                        onChange={(event) => setForm((prev) => ({ ...prev, priceKes: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Price (USD)</span>
                      <input
                        value={form.priceUsd}
                        onChange={(event) => setForm((prev) => ({ ...prev, priceUsd: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Status</span>
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, status: event.target.value as Unit['status'] }))
                        }
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="SOLD">SOLD</option>
                        <option value="RENTED">RENTED</option>
                        <option value="BLOCKED">BLOCKED</option>
                      </select>
                    </label>
                    <label>
                      <span>Bedrooms</span>
                      <input
                        type="number"
                        min={0}
                        value={form.bedrooms}
                        onChange={(event) => setForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Parking Slots</span>
                      <input
                        type="number"
                        min={0}
                        value={form.parkingSlots}
                        onChange={(event) => setForm((prev) => ({ ...prev, parkingSlots: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="portal-check-row">
                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={form.hasBalcony}
                        onChange={(event) => setForm((prev) => ({ ...prev, hasBalcony: event.target.checked }))}
                      />
                      <span>Balcony</span>
                    </label>
                    <label>
                      <span>Bathrooms</span>
                      <input
                        type="number"
                        min="0"
                        value={form.bathrooms ?? '0'}
                        onChange={(event) => setForm((prev) => ({ ...prev, bathrooms: event.target.value }))}
                      />
                    </label>

                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={form.hasStore}
                        onChange={(event) => setForm((prev) => ({ ...prev, hasStore: event.target.checked }))}
                      />
                      <span>Store</span>
                    </label>
                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={form.isFeatured || false}
                        onChange={(event) => setForm((prev) => ({ ...prev, isFeatured: event.target.checked }))}
                      />
                      <span>Feature on homepage</span>
                    </label>
                  </div>
                  {form.isFeatured ? (
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Homepage order</span>
                        <input
                          type="number"
                          min="1"
                          value={form.featuredOrder ?? ''}
                          placeholder="Lowest shows first"
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              featuredOrder: event.target.value ? Number(event.target.value) : null,
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </article>

              {canReadTenancy ? (
                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <div>
                      <h2 style={{ margin: 0 }}>Rent &amp; Monthly Charges</h2>
                      <p className="portal-muted">
                        {tenancy
                          ? 'Rent and recurring utilities for the tenant currently occupying this unit. These drive the monthly payment reminders.'
                          : 'Rent and utilities belong to a tenancy.'}
                      </p>
                    </div>
                    {tenancy && canUpdateTenancy ? (
                      <button
                        type="button"
                        className="portal-inline-btn"
                        onClick={() => void onSaveRentAndUtilities()}
                        disabled={savingRent}
                      >
                        {savingRent ? 'Saving...' : 'Save Rent & Charges'}
                      </button>
                    ) : null}
                  </div>

                  {!tenancy ? (
                    <div className="portal-empty-state">
                      This unit has no tenancy yet. Assign a tenant from the unit page to set rent and
                      monthly utilities.{' '}
                      <Link href={`/portal/units/${unitId}`}>Go to unit</Link>
                    </div>
                  ) : (
                    <div className="portal-entity-form">
                      {!canUpdateTenancy ? (
                        <div className="portal-role-banner">
                          You have read-only access to tenancy records, so these values cannot be changed.
                        </div>
                      ) : null}

                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Monthly Rent</span>
                          <input
                            value={rentForm.monthlyRent}
                            disabled={!canUpdateTenancy}
                            onChange={(event) =>
                              setRentForm((prev) => ({ ...prev, monthlyRent: event.target.value }))
                            }
                          />
                        </label>
                        <label>
                          <span>Currency</span>
                          <select
                            value={rentForm.currency}
                            disabled={!canUpdateTenancy}
                            onChange={(event) =>
                              setRentForm((prev) => ({ ...prev, currency: event.target.value }))
                            }
                          >
                            <option value="KES">KES</option>
                            <option value="USD">USD</option>
                          </select>
                        </label>
                      </div>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Deposit</span>
                          <input
                            value={rentForm.depositAmount}
                            disabled={!canUpdateTenancy}
                            onChange={(event) =>
                              setRentForm((prev) => ({ ...prev, depositAmount: event.target.value }))
                            }
                          />
                        </label>
                        <label>
                          <span>Rent Due Day</span>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={rentForm.rentDueDay}
                            disabled={!canUpdateTenancy}
                            onChange={(event) =>
                              setRentForm((prev) => ({ ...prev, rentDueDay: event.target.value }))
                            }
                          />
                        </label>
                      </div>

                      <h3 style={{ margin: '6px 0 0', fontSize: 16 }}>Recurring Utilities</h3>
                      <p className="portal-muted" style={{ marginTop: 0 }}>
                        Leave an amount blank to remove that charge. Blank due day follows the rent due
                        day. Unticking Active keeps the amount on file but stops its reminders.
                      </p>

                      <div className="portal-list-stack">
                        {utilityRows.map((row, index) => (
                          <div key={row.category} className="portal-record">
                            <div className="portal-entity-grid-3">
                              <label>
                                <span>{formatCategory(row.category)}</span>
                                <input
                                  inputMode="decimal"
                                  placeholder="Amount"
                                  value={row.amount}
                                  disabled={!canUpdateTenancy}
                                  onChange={(event) =>
                                    setUtilityRows((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, amount: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <span>Due Day</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  placeholder={rentForm.rentDueDay || '1'}
                                  value={row.dueDay}
                                  disabled={!canUpdateTenancy}
                                  onChange={(event) =>
                                    setUtilityRows((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, dueDay: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <span>Notes</span>
                                <input
                                  value={row.notes}
                                  disabled={!canUpdateTenancy}
                                  onChange={(event) =>
                                    setUtilityRows((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, notes: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <div className="portal-check-row">
                              <label className="portal-check">
                                <input
                                  type="checkbox"
                                  checked={row.isActive}
                                  disabled={!canUpdateTenancy || !row.amount.trim()}
                                  onChange={(event) =>
                                    setUtilityRows((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, isActive: event.target.checked }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                <span>Active</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="portal-detail-stats">
                        <div>
                          <span>Total Monthly Billing</span>
                          <strong>
                            {rentForm.currency} {monthlyTotal.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </div>
                      </div>

                      {canUpdateTenancy ? (
                        <button
                          type="button"
                          className="portal-primary-btn"
                          onClick={() => void onSaveRentAndUtilities()}
                          disabled={savingRent}
                        >
                          {savingRent ? 'Saving...' : 'Save Rent & Charges'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              ) : null}

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Floor Plan</h2>
                    <p className="portal-muted">
                      Which of the project&rsquo;s layouts this unit is built to. Changing it does not
                      touch the figures below — use Copy Figures if you want them refreshed.
                    </p>
                  </div>
                </div>
                <div className="portal-entity-form">
                  <label>
                    <span>Assigned plan</span>
                    <select
                      value={form.floorPlanId ?? ''}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, floorPlanId: event.target.value }))
                      }
                      disabled={!canUpdate || floorPlans.length === 0}
                    >
                      <option value="">
                        {floorPlans.length === 0
                          ? 'No plans defined for this project'
                          : 'None — figures entered manually'}
                      </option>
                      {floorPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} · {plan.bedrooms === 0 ? 'Studio' : `${plan.bedrooms} bed`} ·{' '}
                          {formatSqft(plan.sizeSqm)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="portal-action-row">
                    {canUpdate && form.floorPlanId ? (
                      <button type="button" className="portal-inline-btn" onClick={copyFromPlan}>
                        Copy Figures From Plan
                      </button>
                    ) : null}
                    {unitProjectId ? (
                      <Link
                        href={`/portal/floor-plans?projectId=${unitProjectId}`}
                        className="portal-inline-btn"
                      >
                        Manage Plans
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Listing Details</h2>
                    <p className="portal-muted">
                      Shown in the spec table on the public listing. Anything left blank is omitted
                      from the page rather than printed as a dash.
                    </p>
                  </div>
                </div>
                <div className="portal-entity-form">
                <div className="portal-entity-grid-3">
                  <label>
                    <span>Property type</span>
                    <input
                      value={form.propertyType ?? ''}
                      placeholder="Apartment"
                      onChange={(event) => setForm((prev) => ({ ...prev, propertyType: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Listing type</span>
                    <select
                      value={form.listingType ?? ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, listingType: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      <option value="SALE">For sale</option>
                      <option value="RENT">For rent</option>
                    </select>
                  </label>
                  <label>
                    <span>Property ID</span>
                    <input
                      value={form.referenceCode ?? ''}
                      placeholder="DRL-002"
                      onChange={(event) => setForm((prev) => ({ ...prev, referenceCode: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="portal-entity-grid-3">
                  <label>
                    <span>Available from</span>
                    <input
                      type="date"
                      value={form.availableFrom ?? ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, availableFrom: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Furnishing</span>
                    <input
                      value={form.furnishing ?? ''}
                      placeholder="Furnished executive unit"
                      onChange={(event) => setForm((prev) => ({ ...prev, furnishing: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Portfolio</span>
                    <select
                      value={form.portfolio ?? ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, portfolio: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      <option value="Investment">Investment</option>
                      <option value="Living">Living</option>
                      <option value="Rental">Rental</option>
                    </select>
                  </label>
                  <label>
                    <span>Lot size (sq ft)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.lotSizeSqm ?? ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, lotSizeSqm: event.target.value }))}
                    />
                  </label>
                </div>
                <label>
                  <span>Extra details</span>
                  <input
                    value={form.extraDetails ?? ''}
                    placeholder="Approved plans available"
                    onChange={(event) => setForm((prev) => ({ ...prev, extraDetails: event.target.value }))}
                  />
                </label>
                </div>
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Floor Plan</h2>
                    <p className="portal-muted">Upload a floor plan image or PDF for this unit.</p>
                  </div>
                  <div className="portal-inline-actions">
                    <button
                      type="button"
                      className="portal-inline-btn"
                      disabled={uploadingFloorPlan}
                      onClick={() => floorPlanInputRef.current?.click()}
                    >
                      {uploadingFloorPlan ? 'Uploading...' : form.floorPlanUrl ? 'Replace Floor Plan' : 'Upload Floor Plan'}
                    </button>
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => setFloorPlanPickerOpen(true)}
                    >
                      Choose Existing
                    </button>
                  </div>
                </div>

                <ImagePicker
                  open={floorPlanPickerOpen}
                  token={token}
                  onClose={() => setFloorPlanPickerOpen(false)}
                  onSelect={([url]) => setForm((prev) => ({ ...prev, floorPlanUrl: url }))}
                  usedUrls={form.floorPlanUrl ? [form.floorPlanUrl] : []}
                  title="Choose an existing drawing"
                />

                {form.floorPlanUrl ? (
                  <div className="portal-featured-preview">
                    <div className="portal-featured-preview-label">Current floor plan</div>
                    {/\.(png|jpe?g|webp|gif)$/i.test(form.floorPlanUrl) ? (
                      <img src={form.floorPlanUrl} alt="Unit floor plan" />
                    ) : (
                      <p style={{ margin: 0 }}>
                        <a href={form.floorPlanUrl} target="_blank" rel="noreferrer">
                          Open floor plan document
                        </a>
                      </p>
                    )}
                    <div className="portal-gallery-item-actions">
                      <button type="button" className="portal-inline-btn is-danger" onClick={removeFloorPlan}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="portal-empty-state">No floor plan uploaded yet.</div>
                )}

                <input
                  ref={floorPlanInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      void onFloorPlanSelected(event.target.files[0]);
                      event.target.value = '';
                    }
                  }}
                />
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Unit Photos</h2>
                    <p className="portal-muted">
                      Drag and drop multiple images, then mark one as featured for listings and unit cards.
                    </p>
                  </div>
                  <div className="portal-inline-actions">
                    <button
                      type="button"
                      className="portal-inline-btn"
                      disabled={uploading}
                      onClick={() => galleryInputRef.current?.click()}
                    >
                      {uploading ? 'Uploading...' : 'Browse Images'}
                    </button>
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => setGalleryPickerOpen(true)}
                    >
                      Choose Existing
                    </button>
                  </div>
                </div>

                <ImagePicker
                  open={galleryPickerOpen}
                  token={token}
                  multiple
                  onClose={() => setGalleryPickerOpen(false)}
                  onSelect={(urls) =>
                    setForm((prev) => {
                      const added = urls.filter((url) => !prev.galleryImages.includes(url));
                      return {
                        ...prev,
                        galleryImages: [...prev.galleryImages, ...added],
                        // First image into an empty gallery becomes the featured
                        // one, matching what uploading does.
                        featuredImageUrl: prev.featuredImageUrl || added[0] || prev.featuredImageUrl,
                      };
                    })
                  }
                  usedUrls={form.galleryImages}
                  title="Choose existing unit images"
                />

                {form.featuredImageUrl ? (
                  <div className="portal-featured-preview">
                    <div className="portal-featured-preview-label">Current featured photo</div>
                    <img src={form.featuredImageUrl} alt="Featured unit" />
                  </div>
                ) : null}

                <div
                  className={`portal-dropzone${dragging ? ' is-dragging' : ''}${uploading ? ' is-disabled' : ''}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!uploading) setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!uploading) setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragging(false);
                  }}
                  onDrop={(event) => {
                    if (uploading) return;
                    onDrop(event);
                  }}
                  onClick={() => {
                    if (!uploading) galleryInputRef.current?.click();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (!uploading) galleryInputRef.current?.click();
                    }
                  }}
                >
                  <strong>{uploading ? 'Uploading images…' : 'Drag & drop unit photos here'}</strong>
                  <p>PNG, JPG, or WebP. You can select multiple files. Click any photo below to set it as featured.</p>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        void addImageFiles(event.target.files);
                        event.target.value = '';
                      }
                    }}
                  />
                </div>

                <div className="portal-project-gallery-grid" style={{ marginTop: 16 }}>
                  {form.galleryImages.length === 0 ? (
                    <div className="portal-empty-state">No photos uploaded yet.</div>
                  ) : (
                    form.galleryImages.map((image, index) => {
                      const isFeatured = form.featuredImageUrl === image;
                      return (
                        <div
                          key={`${image}-${index}`}
                          className={`portal-project-gallery-item${isFeatured ? ' is-featured' : ''}`}
                        >
                          <button
                            type="button"
                            className="portal-gallery-image-btn"
                            onClick={() => setFeatured(image)}
                            title="Set as featured"
                          >
                            <img src={image} alt={`Unit photo ${index + 1}`} className="portal-project-gallery-thumb" />
                          </button>
                          <div className="portal-gallery-item-actions">
                            {isFeatured ? (
                              <span className="portal-featured-badge">Featured</span>
                            ) : (
                              <button type="button" className="portal-inline-btn" onClick={() => setFeatured(image)}>
                                Set Featured
                              </button>
                            )}
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => removeImage(image)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>

              <div className="portal-inline-actions">
                <button type="submit" className="portal-primary-btn" disabled={saving || uploading || uploadingFloorPlan}>
                  {saving ? 'Saving...' : uploading || uploadingFloorPlan ? 'Wait for uploads...' : 'Save Unit'}
                </button>
                <Link href={`/portal/units/${unitId}`} className="portal-ghost-btn">
                  Back to Unit
                </Link>
              </div>
            </form>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
