import { phoneTail, realEmail } from '../common/contact-email';

/**
 * Finding customers who are really the same person, deciding which record to keep, and which groups are safe to merge without a person looking.
 * Pure: no database. The merging itself is in customer-merge.service.ts.
 *
 * Where duplicates come from: a shopper checks out with a phone number alone (a stand-in address is made for them), later signs up with an email
 * and becomes a second record; a walk-in is rung up twice; one email typed in two cases. Two records are linked when they share a phone number
 * (the last nine digits, so 0722..., +254722... and 254722... match) or the same email ignoring case, and links chain: A and B by phone, B and C by
 * email, makes one group of three.
 *
 * Only active retail customers are considered. A reseller or wholesale account carries a price list, a credit limit, a referral code and
 * commission, and is never merged into a shopper, or a shopper into it, because a phone number matches.
 */

export type DupCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isActive: boolean;
  priceTier: string;
  referralCode: string | null;
  portalEnabled: boolean;
  hasPassword: boolean;
  createdAt: Date;
  orders: number;
  lastOrderAt: Date | null;
};

export type DupGroup = {
  /** Why these are linked, for the screen: "Same phone 0722 123 456", "Same email", or both. */
  reason: string;
  members: DupCustomer[];
  /** The record to keep unless staff choose another. */
  keepId: string;
  /** True when nobody needs to look: every other record is plainly the same person with nothing to lose. */
  safe: boolean;
  /** When it is not safe, what to check. */
  caution: string | null;
};

/** The last nine digits when there are at least nine, else null: a short or missing number is not evidence of anything. */
export function phoneKey(phone: string | null | undefined): string | null {
  const tail = phoneTail(phone ?? '');
  return tail.length === 9 ? tail : null;
}

export const hasRealEmail = (c: Pick<DupCustomer, 'email'>) => realEmail(c.email) !== null;

const GENERIC = /^(walk-?in|walk in|guest|customer|unknown|n\/a|na|-)$/i;
const firstWord = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
export const isGenericName = (c: Pick<DupCustomer, 'firstName' | 'lastName'>) => {
  const full = `${c.firstName} ${c.lastName}`.trim();
  return full === '' || GENERIC.test(c.firstName.trim()) || GENERIC.test(full);
};

/** Whether two records could be one person by name: either is a stand-in name, or the first names are the same. */
export function namesAgree(a: DupCustomer, b: DupCustomer): boolean {
  if (isGenericName(a) || isGenericName(b)) return true;
  const x = firstWord(a.firstName);
  const y = firstWord(b.firstName);
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** The best record to keep: a real email, then a working sign-in, then the most orders, then the oldest. Deterministic, so the same group always picks the same one. */
export function pickKeep(members: DupCustomer[]): DupCustomer {
  return [...members].sort(
    (a, b) =>
      Number(hasRealEmail(b)) - Number(hasRealEmail(a)) ||
      Number(b.hasPassword && b.portalEnabled) - Number(a.hasPassword && a.portalEnabled) ||
      b.orders - a.orders ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  )[0];
}

/** Whether `keep` can absorb `other` with nothing to lose and no doubt it is the same person. Otherwise the reason it needs a person to look. */
export function cautionFor(keep: DupCustomer, other: DupCustomer): string | null {
  const a = realEmail(keep.email);
  const b = realEmail(other.email);
  if (a && b && a !== b) return `${other.email} and ${keep.email} are different email addresses: check they are the same person, not two people who share a number.`;
  if (!namesAgree(keep, other)) return `The names differ (${`${other.firstName} ${other.lastName}`.trim()} and ${`${keep.firstName} ${keep.lastName}`.trim()}): check they are the same person.`;
  return null;
}

export function groupDuplicates(customers: DupCustomer[]): DupGroup[] {
  const eligible = customers.filter((c) => c.isActive && c.priceTier === 'RETAIL' && !c.referralCode);
  const parent = new Map(eligible.map((c) => [c.id, c.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };

  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const linkedBy = new Map<string, { phone: boolean; email: boolean }>();
  const mark = (id: string, kind: 'phone' | 'email') => linkedBy.set(id, { phone: false, email: false, ...linkedBy.get(id), [kind]: true });
  for (const c of eligible) {
    const phone = phoneKey(c.phone);
    if (phone) {
      const first = byPhone.get(phone);
      if (first) { union(first, c.id); mark(first, 'phone'); mark(c.id, 'phone'); } else byPhone.set(phone, c.id);
    }
    const email = realEmail(c.email);
    if (email) {
      const first = byEmail.get(email);
      if (first) { union(first, c.id); mark(first, 'email'); mark(c.id, 'email'); } else byEmail.set(email, c.id);
    }
  }

  const sets = new Map<string, DupCustomer[]>();
  for (const c of eligible) sets.set(find(c.id), [...(sets.get(find(c.id)) ?? []), c]);

  const groups: DupGroup[] = [];
  for (const members of sets.values()) {
    if (members.length < 2) continue;
    const keep = pickKeep(members);
    const cautions = members.filter((m) => m.id !== keep.id).map((m) => cautionFor(keep, m)).filter((x): x is string => Boolean(x));
    const byPhoneToo = members.some((m) => linkedBy.get(m.id)?.phone);
    const byEmailToo = members.some((m) => linkedBy.get(m.id)?.email);
    groups.push({
      reason: [byPhoneToo ? `Same phone number ${phoneKey(keep.phone) ? `ending ${phoneKey(keep.phone)!.slice(-6)}` : ''}`.trim() : null, byEmailToo ? 'Same email address' : null].filter(Boolean).join(' and '),
      members: [keep, ...members.filter((m) => m.id !== keep.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())],
      keepId: keep.id,
      safe: cautions.length === 0,
      caution: cautions[0] ?? null,
    });
  }
  // Safe ones last, so the ones needing a look are the first thing staff see; then the biggest first.
  return groups.sort((a, b) => Number(a.safe) - Number(b.safe) || b.members.length - a.members.length || a.keepId.localeCompare(b.keepId));
}

/**
 * What the kept record takes from the ones merged into it, beyond their orders and the rest: only gaps are filled, nothing the kept record
 * already has is overwritten. Most often the kept record is the one with the real email and the others are phone-only, so there is nothing to take.
 * When staff keep a phone-only record and a duplicate has the real email (or a sign-in), the kept record adopts those.
 */
export function adoptFrom(keep: DupCustomer & { location?: string | null; notes?: string | null }, others: Array<DupCustomer & { location?: string | null; notes?: string | null }>) {
  const out: { email?: string; firstName?: string; lastName?: string; location?: string; notes?: string; takePortalFrom?: string } = {};
  const ordered = [...others].sort((a, b) => Number(hasRealEmail(b)) - Number(hasRealEmail(a)) || a.createdAt.getTime() - b.createdAt.getTime());
  if (!hasRealEmail(keep)) {
    const source = ordered.find(hasRealEmail);
    if (source) {
      out.email = realEmail(source.email)!;
      // A sign-in belongs to the email it logs in with, so it travels with it, and only when the kept record has none of its own.
      if (source.hasPassword && !keep.hasPassword) out.takePortalFrom = source.id;
    }
  }
  if (isGenericName(keep)) {
    const named = ordered.find((o) => !isGenericName(o));
    if (named) { out.firstName = named.firstName; out.lastName = named.lastName; }
  }
  if (!keep.location?.trim()) {
    const l = ordered.find((o) => o.location?.trim())?.location?.trim();
    if (l) out.location = l;
  }
  const notes = [keep.notes?.trim(), ...ordered.map((o) => o.notes?.trim())].filter((n, i, all): n is string => Boolean(n) && all.indexOf(n) === i);
  if (notes.length > (keep.notes?.trim() ? 1 : 0)) out.notes = notes.join('\n');
  return out;
}
