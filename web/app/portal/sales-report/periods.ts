/** Day arithmetic on YYYY-MM-DD strings. The server says what "today" is in the shop's time, so nothing here depends on the device's clock zone. */
export type Mode = 'day' | 'week' | 'month' | 'range';

const at = (key: string) => new Date(`${key}T00:00:00Z`);
export const addDays = (key: string, n: number) => new Date(at(key).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const monday = (key: string) => addDays(key, -((at(key).getUTCDay() + 6) % 7));
export const monthFirst = (key: string) => `${key.slice(0, 7)}-01`;
export const monthLast = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const addMonths = (key: string, n: number) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10);
export const isDay = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(at(v).getTime()));
export const fmt = (key: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => at(key).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

/** The first and last day a choice covers. A period still under way stops at today. */
export function spanOf(mode: Mode, anchor: string, rangeFrom: string, rangeTo: string, today: string): { from: string; to: string } {
  if (mode === 'day') return { from: anchor, to: anchor };
  if (mode === 'range') return { from: rangeFrom <= rangeTo ? rangeFrom : rangeTo, to: rangeFrom <= rangeTo ? rangeTo : rangeFrom };
  const from = mode === 'week' ? monday(anchor) : monthFirst(anchor);
  const end = mode === 'week' ? addDays(from, 6) : monthLast(anchor);
  return { from, to: end > today && from <= today ? today : end };
}

export const step = (mode: Mode, anchor: string, by: -1 | 1) => (mode === 'day' ? addDays(anchor, by) : mode === 'week' ? addDays(anchor, 7 * by) : addMonths(anchor, by));

export function titleOf(mode: Mode, from: string, to: string, today: string): string {
  if (mode === 'day') {
    const name = from === today ? 'Today, ' : from === addDays(today, -1) ? 'Yesterday, ' : '';
    return `${name}${fmt(from, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (mode === 'month') return `${fmt(from, { month: 'long', year: 'numeric' })}${to < monthLast(from) ? ' so far' : ''}`;
  const span = from === to ? fmt(from) : `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to)}`;
  return mode === 'week' ? `Week of ${span}${to < addDays(from, 6) ? ' (so far)' : ''}` : span;
}
