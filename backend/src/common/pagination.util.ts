export type Page<T> = { items: T[]; total: number; skip: number; take: number };

/**
 * Runs a findMany/count pair and shapes the envelope every PagedQueryDto-based
 * endpoint returns. Centralised so the skip/take defaulting and the envelope
 * shape can't drift between services -- see PagedQueryDto's doc comment for
 * why the envelope is unconditional rather than opt-in.
 */
export async function paginate<T>(
  findMany: (args: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
  skip: number | undefined,
  take: number | undefined,
): Promise<Page<T>> {
  const effectiveSkip = skip ?? 0;
  const effectiveTake = take ?? 25;

  const [items, total] = await Promise.all([
    findMany({ skip: effectiveSkip, take: effectiveTake }),
    count(),
  ]);

  return { items, total, skip: effectiveSkip, take: effectiveTake };
}

/**
 * Case-insensitive "contains" clause, OR'd across however many Prisma where
 * fragments the caller passes -- one per searchable column or relation path,
 * e.g. `{ unitNumber: { contains: term, mode: 'insensitive' } }` for a plain
 * column or `{ block: { blockName: { contains: term, mode: 'insensitive' } } }`
 * for a nested one. `buildClauses` gets the trimmed term and returns the list;
 * a plain array of clauses is accepted too when no term-specific shaping is
 * needed.
 */
export function searchOr(
  search: string | undefined,
  buildClauses: (term: string) => Record<string, unknown>[],
): Record<string, unknown> | undefined {
  if (!search?.trim()) return undefined;
  const term = search.trim();
  const clauses = buildClauses(term);
  if (clauses.length === 0) return undefined;
  return { OR: clauses };
}

/** Shorthand for the common case: a flat list of case-insensitive "contains" fields, some possibly nested (dot-separated paths become nested Prisma where objects). */
export function containsAny(fields: string[], term: string): Record<string, unknown>[] {
  return fields.map((path) => {
    const segments = path.split('.');
    const leaf: Record<string, unknown> = { contains: term, mode: 'insensitive' };
    return segments.reduceRight<Record<string, unknown>>((acc, segment) => ({ [segment]: acc }), leaf);
  });
}
