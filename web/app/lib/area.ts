/**
 * Floor area units.
 *
 * The database stores square metres and remains the source of truth: the
 * figures were entered as metric, and converting the column would round every
 * historical record for the sake of a label. Square feet are derived at the
 * edges instead -- shown alongside the metric value on read, and converted
 * back to metric on write, so what is stored never depends on which unit an
 * operator happened to type in.
 *
 * Everything here is deliberately in one file: a conversion factor duplicated
 * across a dozen call sites is a factor that eventually disagrees with itself.
 */

/** Exact by definition: 1 ft = 0.3048 m, so 1 m² = 1/0.3048² ft². */
export const SQFT_PER_SQM = 10.763910416709722;

export function sqmToSqft(sqm: number | string | null | undefined): number {
  const value = Number(sqm);
  return Number.isFinite(value) ? value * SQFT_PER_SQM : 0;
}

export function sqftToSqm(sqft: number | string | null | undefined): number {
  const value = Number(sqft);
  return Number.isFinite(value) ? value / SQFT_PER_SQM : 0;
}

/** Whole square feet: the fractional part is well below the precision of a floor plan. */
export function formatSqft(sqm: number | string | null | undefined): string {
  return `${Math.round(sqmToSqft(sqm)).toLocaleString()} sq ft`;
}

function formatSqm(sqm: number | string | null | undefined): string {
  const value = Number(sqm) || 0;
  // Trailing zeros dropped: 102 m², not 102.00 m², while 312.75 keeps its detail.
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} m²`;
}

/**
 * The display form: square feet leading, metric in parentheses.
 *
 * Both are shown because the stored figure is metric and a reader who needs to
 * check it against a title deed or a drawing should not have to convert back.
 */
export function formatArea(sqm: number | string | null | undefined): string {
  const value = Number(sqm);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${formatSqft(value)} (${formatSqm(value)})`;
}

/**
 * Value for a square-feet input, given metric storage.
 *
 * Rounded, because this lands in a form field an operator will read and edit;
 * a size showing 1097.9999 invites them to "fix" it and drift the stored value.
 */
export function sqmToSqftInput(sqm: number | string | null | undefined): string {
  const value = Number(sqm);
  if (!Number.isFinite(value) || value === 0) return '';
  return String(Math.round(sqmToSqft(value)));
}

/**
 * Metric value to store, given what was typed into a square-feet input.
 *
 * `originalSqm` is the value the form was loaded with. If the field still
 * shows the same whole square feet that value renders as, the operator did not
 * touch it and the original is returned untouched.
 *
 * That guard is the whole point. Square feet are displayed rounded, so
 * converting back always lands slightly off the source: 312.75 m² shows as
 * 3366 sq ft, which converts to 312.7116 m². Without this, merely opening a
 * unit and pressing Save would rewrite an accurate figure with a worse one,
 * and every subsequent save would do it again.
 *
 * Kept to four decimals otherwise: enough that a genuine edit round-trips to
 * the same whole square feet, without pretending to millimetre precision.
 */
export function sqftInputToSqm(
  sqft: string | number | null | undefined,
  originalSqm?: number | string | null,
): number | undefined {
  if (sqft === '' || sqft === null || sqft === undefined) return undefined;
  const value = Number(sqft);
  if (!Number.isFinite(value)) return undefined;

  if (originalSqm !== undefined && originalSqm !== null && originalSqm !== '') {
    const original = Number(originalSqm);
    if (Number.isFinite(original) && Math.round(sqmToSqft(original)) === Math.round(value)) {
      return original;
    }
  }

  return Math.round(sqftToSqm(value) * 10000) / 10000;
}

/** Per-unit-area money, e.g. price per square foot. */
export function perSqftFromPerSqm(pricePerSqm: number): number {
  return Number.isFinite(pricePerSqm) ? pricePerSqm / SQFT_PER_SQM : 0;
}
