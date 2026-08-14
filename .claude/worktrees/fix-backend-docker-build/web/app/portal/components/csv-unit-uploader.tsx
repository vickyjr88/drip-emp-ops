"use client";

import { useState, ChangeEvent } from 'react';

export type ProjectBlockMin = {
  id: string;
  blockName: string;
  projectId?: string;
};

type CsvUnitUploaderProps = {
  blocks: ProjectBlockMin[];
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
    sizeSqm: string;
    priceKes: string;
    priceUsd: string;
    bedrooms: number;
    parkingSlots: number;
    hasBalcony: boolean;
    hasStore: boolean;
    status: string;
  };
};

export function downloadCsvTemplate() {
  const headers = [
    'blockName',
    'unitNumber',
    'floorNumber',
    'sizeSqm',
    'priceKes',
    'priceUsd',
    'bedrooms',
    'parkingSlots',
    'hasBalcony',
    'hasStore',
    'status',
  ];
  const sampleRows = [
    ['Block A', '101', '1', '75.5', '8500000', '65000', '2', '1', 'true', 'false', 'AVAILABLE'],
    ['Block A', '102', '1', '90.0', '10200000', '78000', '3', '1', 'true', 'true', 'AVAILABLE'],
    ['Block B', '201', '2', '60.0', '7000000', '53000', '1', '1', 'false', 'false', 'AVAILABLE'],
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
  token,
  isAdmin,
  onSuccess,
  setMutationMessage,
}: CsvUnitUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [defaultBlockId, setDefaultBlockId] = useState<string>(blocks[0]?.id || '');
  const [parsedRows, setParsedRows] = useState<ParsedUnitRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processCsvFile = (file: File, fallbackBlockId: string) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const rawRows = parseCsvText(text);

      const parsed: ParsedUnitRow[] = rawRows.map((row) => {
        const unitNumber = getRowValue(row, ['unitNumber', 'unit_number', 'unit', 'unitno', 'number']);
        const floorStr = getRowValue(row, ['floorNumber', 'floor_number', 'floor']);
        const sizeStr = getRowValue(row, ['sizeSqm', 'size_sqm', 'size', 'sqm']);
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

        const sizeSqm = parseFloat(sizeStr);
        if (isNaN(sizeSqm) || sizeSqm <= 0) errors.push('Invalid/Missing Size (sqm)');

        const priceKes = parseFloat(priceKesStr);
        if (isNaN(priceKes)) errors.push('Invalid/Missing Price KES');

        const priceUsd = parseFloat(priceUsdStr);
        if (isNaN(priceUsd)) errors.push('Invalid/Missing Price USD');

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

        return {
          raw: row,
          valid: true,
          data: {
            blockId: matchedBlock!.id,
            blockNameDisplay: matchedBlock!.blockName,
            unitNumber,
            floorNumber,
            sizeSqm: String(sizeSqm),
            priceKes: String(priceKes),
            priceUsd: String(priceUsd),
            bedrooms: isNaN(beds) ? 0 : beds,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="portal-ghost-btn"
          onClick={downloadCsvTemplate}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span aria-hidden>📥</span> Download CSV Template
        </button>
      </div>

      {blocks.length === 0 ? (
        <p className="portal-muted" style={{ color: '#d97706' }}>
          ⚠️ Please add at least one block to this project before importing units.
        </p>
      ) : (
        <>
          <div className="portal-entity-grid-2" style={{ marginBottom: '1rem' }}>
            <label>
              <span>Default Block (for rows without block name)</span>
              <select value={defaultBlockId} onChange={handleBlockChange}>
                <option value="">-- Select Fallback Block --</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    Block {b.blockName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Select CSV File</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploading}
                style={{ padding: '0.4rem' }}
              />
            </label>
          </div>

          {errorMessage ? (
            <div style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {errorMessage}
            </div>
          ) : null}

          {parsedRows.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <span>Total parsed: <strong>{parsedRows.length}</strong></span>
                <span style={{ color: '#059669' }}>Valid: <strong>{validRows.length}</strong></span>
                {invalidRows.length > 0 ? (
                  <span style={{ color: '#dc2626' }}>Errors: <strong>{invalidRows.length}</strong></span>
                ) : null}
              </div>

              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px', marginBottom: '1rem' }}>
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>Block</th>
                      <th style={{ padding: '0.5rem' }}>Unit #</th>
                      <th style={{ padding: '0.5rem' }}>Floor</th>
                      <th style={{ padding: '0.5rem' }}>Size (sqm)</th>
                      <th style={{ padding: '0.5rem' }}>Price (KES)</th>
                      <th style={{ padding: '0.5rem' }}>Price (USD)</th>
                      <th style={{ padding: '0.5rem' }}>Details / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', background: r.valid ? 'transparent' : '#fef2f2' }}>
                        <td style={{ padding: '0.5rem' }}>
                          {r.valid ? (
                            <span style={{ color: '#059669', fontWeight: 600 }}>✓ Ready</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ Error</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{r.data?.blockNameDisplay || r.raw.blockName || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{r.data?.unitNumber || r.raw.unitNumber || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{r.data?.floorNumber ?? r.raw.floorNumber ?? '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{r.data?.sizeSqm || r.raw.sizeSqm || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{r.data?.priceKes || r.raw.priceKes || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>{r.data?.priceUsd || r.raw.priceUsd || '-'}</td>
                        <td style={{ padding: '0.5rem', color: r.valid ? '#6b7280' : '#dc2626' }}>
                          {r.valid
                            ? `${r.data?.bedrooms} beds, Balcony: ${r.data?.hasBalcony ? 'Yes' : 'No'}`
                            : r.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isAdmin ? (
                <button
                  type="button"
                  className="portal-primary-btn"
                  onClick={handleUploadSubmit}
                  disabled={uploading || validRows.length === 0}
                  style={{ width: '100%' }}
                >
                  {uploading ? 'Importing Units...' : `Import ${validRows.length} Valid Units`}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
