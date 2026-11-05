/**
 * Working out where a visit came from, and what kind of device it was, from what the browser tells us. Pure functions:
 * the same rules are tested without a database and applied once, when a session starts.
 */

export type VisitInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** The full referrer URL as the browser reports it; empty for a typed address or a link from an app that hides it. */
  referrer?: string | null;
  /** Which ad click ids were in the address (fbclid, ttclid, gclid): the ad platforms add these themselves. */
  clickIds?: { fbclid?: boolean; ttclid?: boolean; gclid?: boolean } | null;
  /** The shop's own host, so a click from one of its own pages is not counted as a referral. */
  ownHost?: string | null;
};

export type Visit = { source: string; medium: string; campaign: string | null };

const LABELS: Array<[RegExp, string]> = [
  [/^(facebook|fb|meta|m\.facebook|l\.facebook|lm\.facebook)$/, 'Facebook'],
  [/^(instagram|ig|l\.instagram)$/, 'Instagram'],
  [/^(tiktok|tt|vm\.tiktok)$/, 'TikTok'],
  [/^(google|googleads|adwords)$/, 'Google'],
  [/^(whatsapp|wa|web\.whatsapp|api\.whatsapp)$/, 'WhatsApp'],
  [/^(x|twitter|t\.co)$/, 'X'],
  [/^(youtube|yt)$/, 'YouTube'],
  [/^bing$/, 'Bing'],
  [/^duckduckgo$/, 'DuckDuckGo'],
];

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia)\./;
const SOCIAL = new Set(['Facebook', 'Instagram', 'TikTok', 'WhatsApp', 'X', 'YouTube']);

const clean = (v: string | null | undefined, max: number) => {
  const text = (v ?? '').trim().replace(/[\u0000-\u001f]/g, '');
  return text ? text.slice(0, max) : '';
};

/** A readable label for a source name: "fb" -> "Facebook"; anything unknown is kept, tidied ("my-newsletter"). */
export function sourceLabel(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/^www\./, '');
  for (const [pattern, label] of LABELS) if (pattern.test(key)) return label;
  return key.slice(0, 40);
}

function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function classifyVisit(input: VisitInput): Visit {
  const campaign = clean(input.utmCampaign, 80) || null;
  const utmSource = clean(input.utmSource, 40);
  const utmMedium = clean(input.utmMedium, 40).toLowerCase();

  // 1. The merchant's own tagging wins: they know what they meant.
  if (utmSource) {
    const source = sourceLabel(utmSource);
    return { source, medium: utmMedium || (SOCIAL.has(source) ? 'social' : 'campaign'), campaign };
  }

  // 2. Ad click ids are added by the ad platforms themselves, so an untagged ad still counts as that platform's paid traffic.
  const ids = input.clickIds ?? {};
  if (ids.fbclid) return { source: 'Facebook', medium: 'paid', campaign };
  if (ids.ttclid) return { source: 'TikTok', medium: 'paid', campaign };
  if (ids.gclid) return { source: 'Google', medium: 'paid', campaign };

  // 3. The page they came from.
  const host = hostOf(input.referrer);
  const own = (input.ownHost ?? '').toLowerCase().replace(/^www\./, '');
  if (host && host !== own) {
    const search = host.match(SEARCH_HOSTS);
    if (search) return { source: sourceLabel(search[2]), medium: 'organic', campaign };
    const label = sourceLabel(host.replace(/\.(com|co\.ke|me|net|org)$/, ''));
    if (SOCIAL.has(label)) return { source: label, medium: 'social', campaign };
    return { source: host, medium: 'referral', campaign };
  }

  return { source: 'Direct', medium: 'none', campaign };
}

export type Device = 'mobile' | 'tablet' | 'desktop';

export function deviceOf(userAgent: string | null | undefined): Device {
  const ua = (userAgent ?? '').toLowerCase();
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

/** Crawlers and link-preview fetchers are not shoppers; counting them would inflate every figure. */
export function looksLikeBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? '';
  if (!ua) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|whatsapp\/|preview|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|go-http/i.test(ua);
}
