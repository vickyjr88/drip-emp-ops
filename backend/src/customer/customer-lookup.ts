/**
 * One search box for finding a customer: a name, a mobile number in any format, or an email, or a mix ("john 0712"). Pure, so the reading of what was
 * typed is tested without a database.
 *
 * A mobile number is typed as 0712 345 678, 712345678, +254 712 345 678 or 254712345678, and stored in whichever shape it arrived in, so numbers are
 * compared by their digits with the country code and the leading zero taken off: what is left (712345678) is the same however it was written.
 */
export type LookupQuery = {
  /** Lower-case words that must each appear in the name, business name, trade code or email. */
  words: string[];
  /** Digits of a mobile number, without 254 or a leading 0. Null when what was typed has no number in it. */
  phone: string | null;
  /** A partial or whole email address. */
  email: string | null;
};

const MIN_PHONE_DIGITS = 3;

/** The digits of a phone fragment with the country code or trunk zero removed, so "0712", "+254712" and "712" search the same way. */
export function phoneNeedle(digits: string): string {
  if (digits.startsWith('254') && digits.length > 5) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function parseLookup(raw: string): LookupQuery {
  const words: string[] = [];
  const digitRuns: string[] = [];
  let email: string | null = null;

  for (const token of (raw ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (token.includes('@')) { email = token.toLowerCase(); continue; }
    // A token made only of digits and the punctuation people put in numbers is part of a phone number.
    if (/^[+\d()-]+$/.test(token) && /\d/.test(token)) { digitRuns.push(token.replace(/\D/g, '')); continue; }
    words.push(token.toLowerCase());
  }

  const digits = digitRuns.join('');
  return { words, phone: digits.length >= MIN_PHONE_DIGITS ? phoneNeedle(digits) : null, email };
}

/** Escapes the characters LIKE treats as wildcards, so a search for "50%" or "a_b" finds those characters and not everything. */
export const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Whether the query is worth running: a single letter or two digits would match half the customers. */
export function isSearchable(q: LookupQuery): boolean {
  return Boolean(q.phone) || Boolean(q.email && q.email.length >= 3) || q.words.some((w) => w.length >= 2);
}

/** The last nine digits of a number, the part that is the same in every way of writing it (712345678), for telling whether two records are one person. */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}
