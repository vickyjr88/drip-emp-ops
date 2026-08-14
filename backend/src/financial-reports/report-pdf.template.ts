/**
 * Generic PDF renderer for the financial reports.
 *
 * Every report in FinancialReportsService returns the same broad shape: some
 * metadata (from/to/storeId), one or more arrays of rows, and scalar totals.
 * Rather than eight hand-written templates that drift apart, this walks that
 * shape -- arrays become tables, scalars become a summary block -- so a report
 * that gains a field prints it without anyone remembering to update a template.
 *
 * The trade-off is that column headers come from the data's own key names, so
 * those keys are user-visible here. That is why humanise() exists, and why a
 * report adding a cryptic key will show it: worth knowing when naming fields.
 */

const CURRENCY_HINTS = /(amount|total|balance|revenue|expense|cost|price|paid|due|net|vat|value|income|budget)/i;
const DATE_HINTS = /(date|at|from|to|period)$/i;

/** report keys that are metadata, not content */
const META_KEYS = new Set(['from', 'to', 'asOf', 'storeId', 'projectCode', 'projectName']);

/**
 * Columns dropped from printed tables. A UUID takes a third of the row width
 * and means nothing to a person reading a report; the code and name beside it
 * are what identify the account.
 */
const HIDDEN_COLUMN = /^(id|accountId|storeId|parentId|.*Id)$/;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `totalRevenue` -> `Total Revenue`, `vatOutput` -> `Vat Output`. */
function humanise(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );
}

/**
 * Formats one cell, guessing from the key what kind of value it is.
 *
 * Guessing is acceptable here because getting it wrong degrades to a plain
 * number rather than a wrong number -- the value itself is never altered.
 */
function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' && DATE_HINTS.test(key) && /\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDate(value);
  }
  if (typeof value === 'string' && CURRENCY_HINTS.test(key) && !Number.isNaN(Number(value))) {
    return formatNumber(Number(value));
  }
  return escapeHtml(value);
}

function isNumericKey(key: string, rows: Array<Record<string, unknown>>): boolean {
  return rows.some((row) => typeof row[key] === 'number');
}

/** A value that is itself a list of rows, e.g. a cost group's categories. */
function isRowArray(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null
  );
}

function renderTable(title: string, rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return `<section class="block"><h2>${escapeHtml(title)}</h2>
      <p class="empty">No entries for this period.</p></section>`;
  }

  // Union of keys, not just the first row's: a row missing an optional field
  // would otherwise drop that column for everyone.
  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (HIDDEN_COLUMN.test(key) || keys.includes(key)) continue;
      keys.push(key);
    }
  }

  // Nested row-arrays become an indented sub-table under their parent row
  // rather than a cell. Rendering them inline printed "[object Object]".
  const nestedKeys = keys.filter((key) => rows.some((row) => isRowArray(row[key])));
  const flatKeys = keys.filter((key) => !nestedKeys.includes(key));

  const head = flatKeys
    .map(
      (key) =>
        `<th class="${isNumericKey(key, rows) ? 'num' : ''}">${escapeHtml(humanise(key))}</th>`,
    )
    .join('');

  const body = rows
    .map((row) => {
      const main = `<tr>${flatKeys
        .map(
          (key) =>
            `<td class="${isNumericKey(key, rows) ? 'num' : ''}">${formatCell(key, row[key])}</td>`,
        )
        .join('')}</tr>`;

      const nested = nestedKeys
        .filter((key) => isRowArray(row[key]))
        .map((key) => {
          const children = row[key] as Array<Record<string, unknown>>;
          const childKeys: string[] = [];
          for (const child of children) {
            for (const childKey of Object.keys(child)) {
              if (HIDDEN_COLUMN.test(childKey) || childKeys.includes(childKey)) continue;
              childKeys.push(childKey);
            }
          }
          const childRows = children
            .map(
              (child) =>
                `<tr>${childKeys
                  .map(
                    (childKey) =>
                      `<td class="${isNumericKey(childKey, children) ? 'num' : ''}">${formatCell(childKey, child[childKey])}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('');

          return `<tr class="nested-row"><td colspan="${Math.max(flatKeys.length, 1)}">
            <div class="nested-label">${escapeHtml(humanise(key))}</div>
            <table class="nested"><thead><tr>${childKeys
              .map(
                (childKey) =>
                  `<th class="${isNumericKey(childKey, children) ? 'num' : ''}">${escapeHtml(humanise(childKey))}</th>`,
              )
              .join('')}</tr></thead><tbody>${childRows}</tbody></table>
          </td></tr>`;
        })
        .join('');

      return main + nested;
    })
    .join('');

  return `<section class="block">
    <h2>${escapeHtml(title)}</h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </section>`;
}

function renderSummary(entries: Array<[string, number | string]>): string {
  if (entries.length === 0) return '';
  return `<section class="block">
    <h2>Summary</h2>
    <div class="summary">
      ${entries
        .map(
          ([key, value]) => `<div class="summary-item">
            <span class="summary-label">${escapeHtml(humanise(key))}</span>
            <span class="summary-value">${
              typeof value === 'number' ? formatNumber(value) : escapeHtml(value)
            }</span>
          </div>`,
        )
        .join('')}
    </div>
  </section>`;
}

export function reportPdfTemplate(options: {
  title: string;
  data: Record<string, unknown>;
  /** Shown under the title, e.g. the project this was filtered to. */
  subtitle?: string;
  generatedAt?: Date;
}): string {
  const { title, data, subtitle } = options;
  const generatedAt = options.generatedAt || new Date();

  const tables: string[] = [];
  const summary: Array<[string, number | string]> = [];

  for (const [key, value] of Object.entries(data)) {
    if (META_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        tables.push(renderTable(humanise(key), value as Array<Record<string, unknown>>));
      }
      continue;
    }
    if (typeof value === 'number' || typeof value === 'string') {
      summary.push([key, value]);
    }
    // Nested objects are skipped rather than half-rendered: a report that
    // returns one should get an explicit treatment, not a guess.
  }

  const period = data.from || data.to || data.asOf;
  const periodLine = period
    ? `${data.from ? formatDate(data.from) : 'Start'} – ${formatDate(data.to || data.asOf)}`
    : 'All time';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2121; margin: 0; padding: 0; font-size: 12px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1c1c; padding-bottom: 14px; margin-bottom: 22px; }
  .brand { font-size: 20px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #ba0013; }
  .doc-meta { text-align: right; font-size: 11px; color: #5b6161; line-height: 1.6; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #5b6161; margin: 0; }
  .block { margin-bottom: 22px; break-inside: avoid; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #1a1c1c; border-bottom: 1px solid #d8dcdb; padding-bottom: 6px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: #5b6161; border-bottom: 1px solid #d8dcdb; padding: 7px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #eef0ef; font-size: 12px; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { color: #7c8382; font-style: italic; margin: 0; }
  .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }
  .summary-item { display: flex; justify-content: space-between; border-bottom: 1px solid #eef0ef; padding: 7px 0; }
  .summary-label { color: #5b6161; }
  .summary-value { font-weight: 700; font-variant-numeric: tabular-nums; }
  tr.nested-row td { border-bottom: 1px solid #eef0ef; background: #fafbfb; padding: 8px 10px 12px; }
  .nested-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #7c8382; margin-bottom: 6px; }
  table.nested { width: 100%; }
  table.nested th { font-size: 9px; padding: 4px 6px; border-bottom: 1px solid #e4e7e6; }
  table.nested td { font-size: 11px; padding: 5px 6px; border-bottom: none; }
  .footer { margin-top: 26px; border-top: 1px solid #d8dcdb; padding-top: 10px; font-size: 10px; color: #7c8382; }
</style></head>
<body>
  <div class="doc-header">
    <div>
      <div class="brand">Drip Emporium</div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    <div class="doc-meta">
      <div><strong>Period</strong><br>${periodLine}</div>
      <div style="margin-top:6px"><strong>Generated</strong><br>${formatDate(generatedAt.toISOString())}</div>
    </div>
  </div>

  ${renderSummary(summary)}
  ${tables.join('\n')}

  <div class="footer">
    Generated by Drip Emporium on ${formatDate(generatedAt.toISOString())}. Figures reflect the
    ledger at the time of generation.
  </div>
</body></html>`;
}
