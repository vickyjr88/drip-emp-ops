/**
 * Strips secrets out of request bodies before they are written to the audit log.
 *
 * Several endpoints legitimately accept passwords (staff login, customer portal
 * login, staff-issued portal credentials), so an audit trail that stored raw
 * bodies would persist plaintext passwords indefinitely. Matching is on the key
 * name rather than a list of known routes, so a new endpoint that accepts a
 * secret is covered without anyone remembering to update this file.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|apikey|api_key|authorization|credential|pin|otp|cvv|ssn)/i;

export const REDACTED = '[REDACTED]';

/** Bodies can be large; keep the log useful without storing whole payloads. */
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 6;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (depth >= MAX_DEPTH) return '[depth limit]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => redactSensitive(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`…${value.length - MAX_ARRAY_LENGTH} more`);
    }
    return items;
  }

  if (typeof value === 'object') {
    // Not a plain object (Buffer, Date, stream); do not try to walk it.
    if (value.constructor && value.constructor !== Object) {
      return value instanceof Date ? value.toISOString() : '[object]';
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitive(item, depth + 1);
    }
    return out;
  }

  return '[unsupported]';
}

/** CREATE/UPDATE/DELETE from the HTTP verb; GET is not audited at all. */
export function actionFromMethod(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return method.toUpperCase();
  }
}

/**
 * Derives the resource and its id from the request path.
 *
 * "/tax-rates/abc-123" -> { resource: "tax-rate", resourceId: "abc-123" }
 * "/tenancies/abc/utility-charges" -> { resource: "tenancy-utility-charge", resourceId: "abc" }
 */
export function describeRoute(path: string): { resource: string; resourceId?: string } {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  if (!segments.length) return { resource: 'unknown' };

  const isId = (segment: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^\d+$/.test(segment);

  const names = segments.filter((segment) => !isId(segment));
  const resourceId = segments.find(isId);

  const singular = (word: string) => {
    if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
    if (/ses$/.test(word)) return word.replace(/es$/, '');
    if (/s$/.test(word) && !/ss$/.test(word)) return word.replace(/s$/, '');
    return word;
  };

  // Nested routes read better joined: tenancy-utility-charge, not just tenancy.
  const resource = names.map(singular).join('-') || 'unknown';
  return { resource, resourceId };
}
