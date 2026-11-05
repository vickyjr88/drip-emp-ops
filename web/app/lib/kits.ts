/**
 * The Kits line (jerseys and custom T-shirts), as the storefront sees it. Separate from lib/shop.ts on purpose: kits
 * are never mixed with the shoe catalogue, and every call here goes to /kits/*, which the API answers with 404 while an
 * admin has the line switched off. A failed or refused call returns empty/null, so a page simply is not there.
 */

import type { ShopProduct } from './shop';
import type { KitColors, PrintArea } from '../components/kit-shirt';

const BROWSER_API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const SERVER_API = (process.env.INTERNAL_API_BASE_URL || BROWSER_API).replace(/\/$/, '');
const API = typeof window === 'undefined' ? SERVER_API : BROWSER_API;

export type KitInfo = {
  kind: 'JERSEY' | 'TSHIRT';
  club: { slug: string; name: string; league: string } | null;
  season: string | null;
  edition: 'HOME' | 'AWAY' | 'THIRD' | 'RETRO' | 'NONE';
  templateKey: string;
  colors: KitColors;
  allowName: boolean;
  allowNumber: boolean;
  allowArtwork: boolean;
  photoFront: string | null;
  photoBack: string | null;
  /** Fractions (0 to 1) of the photo, not drawing units. */
  printAreas: Record<string, PrintArea> | null;
  photoAspect: number | null;
  templateCustom: boolean;
  fontKeys: string[];
};

export type KitProduct = Omit<ShopProduct, 'related'> & { kit: KitInfo; related?: KitProduct[] };

export type KitClub = {
  slug: string;
  name: string;
  aliases: string[];
  league: string;
  home: KitColors;
  away: KitColors;
  third: KitColors;
  fontKeys: string[];
  kitCount: number;
};

export type KitFont = { key: string; label: string; family: string; weight: number };
export type KitTemplateColour = { key: string; label: string; hex: string; front: string; back: string };
/** A drawn shirt (custom false) or one staff uploaded photos for (custom true, with its colours and print areas). */
export type KitTemplate = {
  key: string;
  label: string;
  kind: 'JERSEY' | 'TSHIRT';
  custom: boolean;
  aspect?: number;
  areas?: Record<string, PrintArea>;
  colours?: KitTemplateColour[];
};

export type KitConfig = {
  enabled: boolean;
  fonts: KitFont[];
  templates: KitTemplate[];
  patterns: string[];
  teePalette: Array<{ key: string; label: string; hex: string }>;
  pricing: { nameFeeKes: number; numberFeeKes: number; nameAndNumberFeeKes: number; artworkFeeKes: number; textFeeKes: number };
  leadTime: string;
  returnsNote: string;
  fanVersionNote: string;
  listing: { heading: string; intro: string };
  designCenter: { heading: string; intro: string };
};

/** A refused (404 while the line is off) or failed call is "nothing there", never an error page. */
async function get<T>(path: string, fallback: T, token?: string | null, fresh = false): Promise<T> {
  try {
    const response = await fetch(`${API}${path}`, {
      // The on/off check is never cached, so switching the line off hides every page at once; catalogue data is kept for
      // a minute on the server.
      ...(typeof window === 'undefined' && !fresh ? { next: { revalidate: 60 } } : { cache: 'no-store' as const }),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export const fetchKitsEnabled = async () => (await get<{ enabled: boolean }>('/kits/status', { enabled: false }, null, true)).enabled;
export const fetchKitConfig = () => get<KitConfig | null>('/kits/config', null, null, true);
export const fetchClubs = (all = false) => get<KitClub[]>(`/kits/clubs${all ? '?all=true' : ''}`, []);
export const fetchKitClub = (slug: string) =>
  get<{ club: Omit<KitClub, 'kitCount'>; products: KitProduct[]; relatedClubs: Array<{ slug: string; name: string }> } | null>(`/kits/clubs/${slug}`, null);

export function fetchKits(query: Record<string, string | undefined> = {}, token?: string | null) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return get<KitProduct[]>(`/kits/products${suffix}`, [], token);
}

export const fetchKit = (slug: string, token?: string | null) => get<KitProduct | null>(`/kits/products/${slug}`, null, token);

export type SavedDesign = { token: string; productSlug: string | null; spec: import('../components/kit-shirt').DesignSpec; previewUrl: string | null; feeKes: number };
export const fetchDesign = (token: string) => get<SavedDesign | null>(`/kits/designs/${token}`, null);

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export type League = { key: string; slug: string; name: string; short: string; place: string };

export const LEAGUES: League[] = [
  { key: 'EPL', slug: 'premier-league', name: 'Premier League', short: 'EPL', place: 'England' },
  { key: 'LA_LIGA', slug: 'la-liga', name: 'La Liga', short: 'La Liga', place: 'Spain' },
  { key: 'SERIE_A', slug: 'serie-a', name: 'Serie A', short: 'Serie A', place: 'Italy' },
  { key: 'BUNDESLIGA', slug: 'bundesliga', name: 'Bundesliga', short: 'Bundesliga', place: 'Germany' },
  { key: 'LIGUE_1', slug: 'ligue-1', name: 'Ligue 1', short: 'Ligue 1', place: 'France' },
  { key: 'KENYA', slug: 'kenyan-teams', name: 'Kenyan Teams', short: 'Kenya', place: 'Kenya' },
  { key: 'NATIONAL', slug: 'national-teams', name: 'National Teams', short: 'International', place: 'the world' },
];

export const leagueByKey = (key: string) => LEAGUES.find((l) => l.key === key);
export const leagueBySlug = (slug: string) => LEAGUES.find((l) => l.slug === slug);

export const EDITION_LABELS: Record<string, string> = { HOME: 'Home', AWAY: 'Away', THIRD: 'Third', RETRO: 'Retro', NONE: '' };

/** Where a kit page lives. */
export const kitPath = (slug: string) => `/kits/${slug}`;
export const clubPath = (slug: string) => `/kits/club/${slug}`;
export const leaguePath = (slug: string) => `/kits/league/${slug}`;
export const DESIGN_PATH = '/design';
export const designLink = (productSlug?: string, club?: string, edition?: string) => {
  const params = new URLSearchParams();
  if (productSlug) params.set('kit', productSlug);
  else if (club) { params.set('club', club); if (edition) params.set('edition', edition.toLowerCase()); }
  return params.toString() ? `${DESIGN_PATH}?${params}` : DESIGN_PATH;
};
