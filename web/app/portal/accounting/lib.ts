export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
export const TOKEN_KEY = 'de_access_token';

export type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

export type AuthProfile = {
  id: string;
  email: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

export async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
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

export async function downloadFile(path: string, token: string, fallbackFileName: string) {
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

export async function uploadMedia(file: File, token: string) {
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

/**
 * The rows out of a list response, whichever shape it arrived in.
 *
 * Endpoints are being migrated to a { items, total, skip, take } envelope one
 * service at a time, so at any given moment some return the envelope and some
 * still return a bare array. A page written against the old shape does not fail
 * at the fetch -- it stores the envelope object and throws later, on whatever
 * .map or .filter touches it first, which is why these surface as
 * "E.map is not a function" a long way from the call.
 *
 * Anything unrecognised becomes an empty list: a page with no rows is a better
 * outcome than a blank screen, and the request having failed is already
 * reported separately.
 */
export function asList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === 'object') {
    const items = (response as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

export function hasPermission(profile: AuthProfile | null | undefined, permission: string) {
  if (!profile) return false;
  if (profile.role === 'ADMIN' || (Array.isArray(profile.roles) && profile.roles.some((role) => role?.name === 'ADMIN'))) return true;
  return Boolean(Array.isArray(profile.permissions) && profile.permissions.includes(permission));
}

export function formatMoney(value: string | number, currency = 'KES') {
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

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export async function loadProfile(token: string) {
  return apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, token);
}

export function roleLabelFor(profile: AuthProfile | null) {
  if (!profile) return 'Unassigned';
  if (Array.isArray(profile.roles) && profile.roles.length) return profile.roles.map((role) => role.name).join(', ');
  return profile.role || 'Unassigned';
}

export function canReadRbacFor(profile: AuthProfile | null) {
  return (
    hasPermission(profile, 'role.read') ||
    hasPermission(profile, 'permission.read') ||
    hasPermission(profile, 'user.read')
  );
}
