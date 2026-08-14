/**
 * Reads CMS copy for the public marketing pages.
 *
 * The API always merges stored values over its own defaults, so a page that has
 * never been edited still returns full copy. If the API is unreachable we return
 * null and the caller renders the copy compiled into the component, so the
 * marketing site never shows an empty layout because the backend is down.
 */
/**
 * Server components run inside the web container, where `localhost` is the web
 * container itself rather than the API. NEXT_PUBLIC_API_BASE_URL is the browser
 * URL, so server-side rendering needs the internal service address instead --
 * otherwise every server fetch fails and the pages silently render defaults.
 */
const BROWSER_API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const SERVER_API_BASE_URL = (process.env.INTERNAL_API_BASE_URL || BROWSER_API_BASE_URL).replace(/\/$/, '');

const API_BASE_URL = typeof window === 'undefined' ? SERVER_API_BASE_URL : BROWSER_API_BASE_URL;

export type PageContentDocument = Record<string, any>;

export async function fetchPageContent(slug: string): Promise<PageContentDocument | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/page-content/${slug}`, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return payload?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads a dot path out of a content document, falling back when the value is
 * missing or blank. An editor clearing a field should show the default rather
 * than a gap in the layout.
 */
export function contentValue<T>(document: PageContentDocument | null, path: string, fallback: T): T {
  const value = path.split('.').reduce<any>((current, key) => (current == null ? undefined : current[key]), document);

  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  if (Array.isArray(value) && value.length === 0) return fallback;
  return value as T;
}
