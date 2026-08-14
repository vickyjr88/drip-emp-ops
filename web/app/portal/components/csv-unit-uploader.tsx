"use client";

import { useState, ChangeEvent } from 'react';
import { useErrorState } from '../components/notifications';
import Link from 'next/link';
import { formatSqft, sqftToSqm } from '../../lib/area';

export type ProjectBlockMin = {
  id: string;
  blockName: string;
  projectId?: string;
};

type CsvUnitUploaderProps = {
  blocks: ProjectBlockMin[];
  /** Plans for this project, so a row can name one instead of a UUID. */
  floorPlans?: Array<{ id: string; name: string; sizeSqm?: string | number; priceKes?: string | number | null; bedrooms?: number; bathrooms?: number }>;
  token: string | null;
  isAdmin: boolean;
  onSuccess: () => void | Promise<void>;
  setMutationMessage: (msg: string | null) => void;
};

export type ParsedUnitRow = {
  raw: Record<string, string>;
  valid: boolean;
  error?: string;
  data?: {
    blockId: string;
    blockNameDisplay: string;
    unitNumber: string;
    floorNumber: number;
    // Optional: a named floor plan supplies these server-side.
    sizeSqm?: string;
    priceKes?: string;
    priceUsd: string;
    bedrooms?: number;
    parkingSlots: number;
    hasBalcony: boolean;
    hasStore: boolean;
    status: string;
    floorPlanId?: string;
    bathrooms?: number;
    propertyType?: string;
    listingType?: string;
    referenceCode?: string;
    furnishing?: string;
    availableFrom?: string;
  };
};

export function downloadCsvTemplate() {
  const headers = [
    'blockName',
    'unitNumber',
    'floorNumber',
    // Naming a floor plan fills in size, price, bedrooms and bathrooms, so
    // those columns can be left blank for a standard unit and only filled where
    // one differs from its layout.
    'floorPlanName',
    // The unit lives in the header name because the template is the only
    // documentation this importer has, and the parser reads line 0 as the
    // header row, so a comment line above it cannot carry the explanation.
    'sizeSqft',
    'priceKes',
    'priceUsd',
    'bedrooms',
    'bathrooms',
    'parkingSlots',
    'hasBalcony',
    'hasStore',
    'status',
    'propertyType',
    'listingType',
    'referenceCode',
    'furnishing',
    'availableFrom',
  ];
  const sampleRows = [
    // Row 1 names a plan and leaves the figures blank: they come from the plan.
    ['Block A', '101', '1', 'Plan A', '', '', '65000', '', '', '1', 'true', 'false', 'AVAILABLE', 'Apartment', 'SALE', 'DE-101', 'Furnished', '2026-04-20'],
    // Row 2 uses a plan but overrides size and price for a corner unit.
    ['Block A', '102', '1', 'Plan A', '1033', '11000000', '78000', '', '', '1', 'true', 'true', 'AVAILABLE', 'Apartment', 'SALE', 'DE-102', '', ''],
    // Row 3 has no plan, so every figure is given.
    ['Block B', '201', '2', '', '646', '7000000', '53000', '1', '1', '1', 'false', 'false', 'AVAILABLE', 'Apartment', 'RENT', 'DE-201', 'Unfurnished', ''],
  ];
  const csvContent = [headers.join(','), ...sampleRows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'units_upload_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvText(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      lines.push(cur);
      cur = '';
    } else {
      cur += char;
    }
  }
  if (cur.trim().length > 0) lines.push(cur);

  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let val = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          val += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (c === ',' && !q) {
        values.push(val.trim());
        val = '';
      } else {
        val += c;
      }
    }
    values.push(val.trim());
    return values;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] !== undefined ? vals[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function getRowValue(row: Record<string, string>, keys: string[]): string {
  const normalizedRowKeys: Record<string, string> = {};
  for (const k of Object.keys(row)) {
    normalizedRowKeys[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k];
  }
  for (const key of keys) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedRowKeys[normKey] !== undefined && normalizedRowKeys[normKey] !== '') {
      return normalizedRowKeys[normKey];
    }
  }
  return '';
}

export function CsvUnitUploader({
  blocks,
  floorPlans,
  token,
  isAdmin,
  onSuccess,
  setMutationMessage,
}: CsvUnitUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [defaultBlockId, setDefaultBlockId] = useState<string>(blocks[0]?.id || '');
  const [parsedRows, setParsedRows] = useState<ParsedUnitRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();

  const processCsvFile = (file: File, fallbackBlockId: string) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const rawRows = parseCsvText(text);

      const parsed: ParsedUnitRow[] = rawRows.map((row) => {
        const unitNumber = getRowValue(row, ['unitNumber', 'unit_number', 'unit', 'unitno', 'number']);
        const floorStr = getRowValue(row, ['floorNumber', 'floor_number', 'floor']);
        const sizeStr = getRowValue(row, ['sizeSqft', 'size_sqft', 'sqft', 'size']);
        // A file still using the metric header is taken at face value as
        // metric, rather than being read as square feet and importing a unit
        // a tenth of its real size.
        const legacySqmStr = getRowValue(row, ['sizeSqm', 'size_sqm', 'sqm']);
        const priceKesStr = getRowValue(row, ['priceKes', 'price_kes', 'price', 'kes']);
        const priceUsdStr = getRowValue(row, ['priceUsd', 'price_usd', 'usd']);
        const blockNameStr = getRowValue(row, ['blockName', 'block_name', 'block', 'blockid']);
        const bedsStr = getRowValue(row, ['bedrooms', 'bedroom', 'beds']);
        const parkingStr = getRowValue(row, ['parkingSlots', 'parking_slots', 'parking']);
        const balconyStr = getRowValue(row, ['hasBalcony', 'has_balcony', 'balcony']);
        const storeStr = getRowValue(row, ['hasStore', 'has_store', 'store']);
        const statusStr = getRowValue(row, ['status']);

        // Resolve block
        let matchedBlock = blocks.find(
          (b) =>
            b.id === blockNameStr ||
            b.blockName.toLowerCase() === blockNameStr.toLowerCase() ||
            `block ${b.blockName}`.toLowerCase() === blockNameStr.toLowerCase() ||
            b.blockName.toLowerCase() === blockNameStr.replace(/^block\s+/i, '').toLowerCase(),
        );

        if (!matchedBlock && fallbackBlockId) {
          matchedBlock = blocks.find((b) => b.id === fallbackBlockId);
        }

        const errors: string[] = [];
        if (!unitNumber) errors.push('Missing Unit Number');
        
        const floorNumber = parseInt(floorStr, 10);
        if (isNaN(floorNumber)) errors.push('Invalid/Missing Floor Number');

        // A named plan supplies size, price, bedrooms and bathrooms, so those
        // columns are only required when no plan is given.
        const planNameStr = (row.floorPlanName || '').trim();
        const matchedPlan = planNameStr
          ? (floorPlans || []).find(
              (plan) => plan.name.toLowerCase() === planNameStr.toLowerCase() || plan.id === planNameStr,
            )
          : undefined;
        if (planNameStr && !matchedPlan) {
          errors.push(`Floor plan "${planNameStr}" not found in this project`);
        }

        // Stored metric either way: a sq ft column is converted, a legacy
        // metric column is used as-is.
        const sizeSqft = parseFloat(sizeStr);
        const sizeSqm = !isNaN(sizeSqft)
          ? sqftToSqm(sizeSqft)
          : parseFloat(legacySqmStr);
        if ((isNaN(sizeSqm) || sizeSqm <= 0) && !matchedPlan) {
          errors.push('Invalid/Missing Size (sq ft)');
        }

        const priceKes = parseFloat(priceKesStr);
        if (isNaN(priceKes) && !matchedPlan) errors.push('Invalid/Missing Price KES');

        const priceUsd = parseFloat(priceUsdStr);

        if (!matchedBlock) errors.push('Block not found or selected');

        if (errors.length > 0) {
          return {
            raw: row,
            valid: false,
            error: errors.join(', '),
          };
        }

        const beds = parseInt(bedsStr, 10);
        const parking = parseInt(parkingStr, 10);
        const baths = parseInt((row.bathrooms || '').trim(), 10);

        return {
          raw: row,
          valid: true,
          data: {
            blockId: matchedBlock!.id,
            blockNameDisplay: matchedBlock!.blockName,
            unitNumber,
            floorNumber,
            // Left undefined when a plan will fill it, so the server copies
            // rather than the importer guessing a zero.
            sizeSqm: isNaN(sizeSqm) ? undefined : String(sizeSqm),
            priceKes: isNaN(priceKes) ? undefined : String(priceKes),
            priceUsd: isNaN(priceUsd) ? '0' : String(priceUsd),
            floorPlanId: matchedPlan?.id,
            bathrooms: isNaN(baths) ? undefined : baths,
            propertyType: (row.propertyType || '').trim() || undefined,
            listingType: (row.listingType || '').trim().toUpperCase() || undefined,
            referenceCode: (row.referenceCode || '').trim() || undefined,
            furnishing: (row.furnishing || '').trim() || undefined,
            availableFrom: (row.availableFrom || '').trim() || undefined,
            bedrooms: isNaN(beds) ? undefined : beds,
            parkingSlots: isNaN(parking) ? 0 : parking,
            hasBalcony: ['true', '1', 'yes', 'y'].includes(balconyStr.toLowerCase()),
            hasStore: ['true', '1', 'yes', 'y'].includes(storeStr.toLowerCase()),
            status: statusStr ? statusStr.toUpperCase() : 'AVAILABLE',
          },
        };
      });

      setParsedRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
      processCsvFile(file, defaultBlockId);
    }
  };

  const handleBlockChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newBlockId = e.target.value;
    setDefaultBlockId(newBlockId);
    if (selectedFile) {
      processCsvFile(selectedFile, newBlockId);
    }
  };

  const validRows = parsedRows.filter((r) => r.valid && r.data);
  const invalidRows = parsedRows.filter((r) => !r.valid);

  const handleUploadSubmit = async () => {
    if (!isAdmin) {
      setMutationMessage('Agent role is read-only. Switch to an admin account.');
      return;
    }
    if (!token) {
      setErrorMessage('Authentication required.');
      return;
    }
    if (validRows.length === 0) {
      setErrorMessage('No valid unit rows to upload.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const payload = validRows.map((r) => ({
        blockId: r.data!.blockId,
        unitNumber: r.data!.unitNumber,
        floorNumber: r.data!.floorNumber,
        sizeSqm: r.data!.sizeSqm,
        priceKes: r.data!.priceKes,
        priceUsd: r.data!.priceUsd,
        bedrooms: r.data!.bedrooms,
        parkingSlots: r.data!.parkingSlots,
        hasBalcony: r.data!.hasBalcony,
        hasStore: r.data!.hasStore,
        status: r.data!.status,
      }));

      const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100').replace(/\/$/, '');
      const res = await fetch(`${apiBaseUrl}/units/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || `Failed to upload units (${res.status})`);
      }

      setMutationMessage(`Successfully imported ${validRows.length} units via CSV.`);
      setSelectedFile(null);
      setParsedRows([]);
      await onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during CSV import.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="portal-csv-uploader">
      <div className="portal-inline-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="portal-inline-btn" onClick={downloadCsvTemplate}>
          Download Template
        </button>
        <Link href="/portal/importers/docs" className="portal-inline-btn">
          Column Reference
        </Link>
      </div>

      {blocks.length === 0 ? (
        <div className="portal-empty-state">
          Units belong to a block, and this project has none yet. Add a block before importing units.
        </div>
      ) : (
        <>
          <div className="portal-entity-form" style={{ marginBottom: 14 }}>
            <div className="portal-entity-grid-2">
              <label>
                <span>Default Block (for rows with no block name)</span>
                <select value={defaultBlockId} onChange={handleBlockChange}>
                  <option value="">Each row must name its block</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.blockName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>CSV File</span>
                <input type="file" accept=".csv" onChange={handleFileChange} disabled={uploading} />
              </label>
            </div>
          </div>

          {errorMessage ? (
            <div className="portal-error" style={{ marginBottom: 14 }}>
              {errorMessage}
            </div>
          ) : null}

          {parsedRows.length > 0 ? (
            <>
              <div className="portal-stats-grid">
                <article className="portal-card portal-stat-card">
                  <span>Rows Ready</span>
                  <strong>{validRows.length}</strong>
                </article>
                <article className="portal-card portal-stat-card">
                  <span>Rows With Errors</span>
                  <strong>{invalidRows.length}</strong>
                </article>
                <article className="portal-card portal-stat-card">
                  <span>Total Rows</span>
                  <strong>{parsedRows.length}</strong>
                </article>
              </div>

              {invalidRows.length > 0 ? (
                <>
                  <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>
                    Fix these {invalidRows.length} rows
                  </h3>
                  <p className="portal-muted" style={{ marginTop: 0 }}>
                    Only valid rows are imported. Row numbers match your spreadsheet.
                  </p>
                  <div className="portal-list-stack">
                    {parsedRows
                      .map((row, index) => ({ row, index }))
                      .filter(({ row }) => !row.valid)
                      .slice(0, 50)
                      .map(({ row, index }) => (
                        <div key={index} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>
                                Row {index + 2}
                                {row.raw.unitNumber ? ` — ${row.raw.unitNumber}` : ''}
                              </strong>
                              <p>{row.error}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : null}

              {validRows.length > 0 ? (
                <>
                  <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>Ready to import</h3>
                  <div className="portal-list-stack">
                    {parsedRows
                      .filter((row) => row.valid)
                      .slice(0, 25)
                      .map((row, index) => (
                        <div key={index} className="portal-list-row" style={{ fontSize: 13 }}>
                          <div>
                            <strong>{row.data?.unitNumber}</strong>
                            <p>
                              {row.data?.blockNameDisplay || 'Default block'} • floor {row.data?.floorNumber} •{' '}
                              {row.data?.bedrooms} bed •{' '}
                              {row.data?.sizeSqm ? formatSqft(row.data.sizeSqm) : '—'}
                              {row.data?.hasBalcony ? ' • balcony' : ''}
                              {row.data?.hasStore ? ' • store' : ''}
                            </p>
                          </div>
                          <span>KES {Number(row.data?.priceKes || 0).toLocaleString('en-US')}</span>
                        </div>
                      ))}
                    {validRows.length > 25 ? (
                      <p className="portal-muted">…and {validRows.length - 25} more rows.</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {isAdmin ? (
                <div className="portal-inline-actions" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="portal-primary-btn"
                    onClick={handleUploadSubmit}
                    disabled={uploading || validRows.length === 0}
                  >
                    {uploading ? 'Importing...' : `Import ${validRows.length} Unit${validRows.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
