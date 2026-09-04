/**
 * Buckets a set of dated rows into one count per day across a fixed window,
 * filling days with no activity as zero rather than omitting them -- a gap
 * in a trend chart should read as "nothing happened that day," not be
 * invisible. Same shape as InquiryService.stats()'s own trend, pulled out
 * so campaign and reseller performance can build the same kind of chart
 * without re-deriving the bucketing logic.
 */
export function dailyTrend(dates: Date[], days: number): Array<{ date: string; count: number }> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (date < since) continue;
    const key = dayKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const trend: Array<{ date: string; count: number }> = [];
  for (let index = 0; index < days; index += 1) {
    const day = new Date(since);
    day.setDate(since.getDate() + index);
    const key = dayKey(day);
    trend.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return trend;
}

/** The `since` cutoff dailyTrend uses internally, exposed so a caller's own query can filter to the same window rather than fetching more rows than it will ever bucket. */
export function trendSince(days: number): Date {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return since;
}
