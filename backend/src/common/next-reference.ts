/**
 * The next reference in a yearly series: INV-2026-00007, DE-2026-00012.
 *
 * Every one of these used to be `count() + 1`, which is wrong twice over.
 * Deleting a record makes the count fall and the next write reissues a number
 * already in use -- which is how a checkout came to collide with an existing
 * DE-2026-00002 -- and two requests in the same moment both read the same
 * count and both claim it.
 *
 * Reading the highest number actually issued fixes the first. The second needs
 * the caller to retry, because between reading and writing another transaction
 * can still slip in; `withUniqueReference` does that, and leans on the unique
 * index as the real arbiter rather than hoping the gap is small enough.
 */

type Delegate = {
  findFirst: (args: any) => Promise<any>;
};

export async function nextReference(
  delegate: Delegate,
  field: string,
  prefix: string,
  year: number = new Date().getFullYear(),
  width = 5,
): Promise<string> {
  const series = `${prefix}-${year}-`;
  const latest = await delegate.findFirst({
    where: { [field]: { startsWith: series } },
    // Lexical order is numeric order here: the counter is zero-padded to a
    // fixed width, so "00010" sorts after "00009".
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });

  const highest = latest?.[field] ? Number(String(latest[field]).slice(series.length)) : 0;
  const next = (Number.isFinite(highest) ? highest : 0) + 1;
  return `${series}${String(next).padStart(width, '0')}`;
}

/** Postgres' unique-violation code. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Re-runs an operation that failed only because its reference was taken.
 *
 * Retries are the honest answer here: any read-then-write scheme has a gap,
 * and the unique index is the only thing that can actually adjudicate. Three
 * attempts with no delay between them is plenty when only two requests ever
 * collide -- but several arriving at once (a burst of approvals, a bulk
 * action) all read the same "next" number, all lose to the one that writes
 * first, and then all retry at the same instant and collide with each other
 * again, exhausting attempts before the herd thins out. A short, randomised
 * delay before each retry -- growing attempt over attempt -- spreads them
 * out so each pass has a real chance of finding a gap instead of re-colliding
 * in lockstep.
 */
export async function retryOnDuplicateReference<T>(
  run: () => Promise<T>,
  attempts = 6,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error: any) {
      if (error?.code !== UNIQUE_VIOLATION) throw error;
      lastError = error;
      if (attempt < attempts - 1) {
        const backoffMs = 10 * (attempt + 1) + Math.random() * 25;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}
