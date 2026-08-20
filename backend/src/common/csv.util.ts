/**
 * Escapes one CSV field.
 *
 * Quoted whenever the value contains a comma, quote or newline -- anything
 * else and the extra quoting is just noise in a file meant to be read by
 * both a spreadsheet and, for a feed like Meta's, a machine that is
 * stricter about it. A literal quote inside the value is doubled, the
 * standard CSV escape, so it survives being re-parsed rather than closing
 * the field early.
 */
export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
