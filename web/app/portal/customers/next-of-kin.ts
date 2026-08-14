export type NextOfKin = {
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  /** Share of related ownership interest attributed to this next of kin (0–100). */
  ownershipPercentage?: number;
};

export type NextOfKinFormProps = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  ownershipPercentage: string;
};

export function emptyNextOfKinForm(percentage = '0'): NextOfKinFormProps {
  return {
    name: '',
    relationship: '',
    phone: '',
    email: '',
    ownershipPercentage: percentage,
  };
}

/** Accept legacy single-object JSON or the new array format. */
export function normalizeNextOfKinList(value: unknown): NextOfKin[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeOne(entry))
      .filter((entry): entry is NextOfKin => Boolean(entry));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.contacts)) {
      return normalizeNextOfKinList(record.contacts);
    }
    const one = normalizeOne(value);
    return one ? [one] : [];
  }

  return [];
}

function normalizeOne(value: unknown): NextOfKin | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) {
    return null;
  }

  const percentageRaw = record.ownershipPercentage;
  let ownershipPercentage: number | undefined;
  if (percentageRaw !== undefined && percentageRaw !== null && percentageRaw !== '') {
    const numeric = Number(percentageRaw);
    if (!Number.isNaN(numeric)) {
      ownershipPercentage = Math.max(0, Math.min(100, numeric));
    }
  }

  return {
    name,
    relationship: typeof record.relationship === 'string' ? record.relationship : undefined,
    phone: typeof record.phone === 'string' ? record.phone : undefined,
    email: typeof record.email === 'string' ? record.email : undefined,
    ownershipPercentage,
  };
}

export function toNextOfKinFormList(value: unknown): NextOfKinFormProps[] {
  const list = normalizeNextOfKinList(value);
  if (!list.length) {
    return [emptyNextOfKinForm('100')];
  }

  return list.map((entry) => ({
    name: entry.name || '',
    relationship: entry.relationship || '',
    phone: entry.phone || '',
    email: entry.email || '',
    ownershipPercentage:
      entry.ownershipPercentage !== undefined && entry.ownershipPercentage !== null
        ? String(entry.ownershipPercentage)
        : '0',
  }));
}

export function serializeNextOfKinList(forms: NextOfKinFormProps[]): NextOfKin[] | null {
  const cleaned: NextOfKin[] = [];

  for (const entry of forms) {
    const name = entry.name.trim();
    if (!name) {
      continue;
    }

    const percentage = Number(entry.ownershipPercentage);
    cleaned.push({
      name,
      relationship: entry.relationship.trim() || undefined,
      phone: entry.phone.trim() || undefined,
      email: entry.email.trim() || undefined,
      ownershipPercentage: Number.isNaN(percentage) ? 0 : Math.max(0, Math.min(100, percentage)),
    });
  }

  return cleaned.length ? cleaned : null;
}

export function totalNextOfKinOwnership(forms: Array<{ ownershipPercentage?: string | number | null }>) {
  return forms.reduce((sum, entry) => sum + (Number(entry.ownershipPercentage) || 0), 0);
}
