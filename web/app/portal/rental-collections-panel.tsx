"use client";

import { useEffect, useState } from 'react';

type CollectionsReport = {
  from: string;
  to: string;
  currency: string;
  grandTotal: number;
  paymentCount: number;
  byCategory: Array<{ category: string; total: number; count: number }>;
  byMonth: Array<{ month: string; total: number; byCategory: Record<string, number> }>;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

async function apiRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default function RentalCollectionsPanel({
  token,
  canRead,
}: {
  token: string | null;
  canRead: boolean;
}) {
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('KES');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CollectionsReport | null>(null);

  async function loadReport() {
    if (!token || !canRead) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await apiRequest<CollectionsReport>(
        `/rental-payments/collections?from=${from}&to=${to}&currency=${currency}`,
        token,
      );
      setReport(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load collections.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  if (!canRead) {
    return (
      <article className="portal-card">
        <h2>Rent & Utility Collections</h2>
        <div className="portal-empty-state">You do not have permission to view rental collections.</div>
      </article>
    );
  }

  return (
    <article className="portal-card">
      <h2>Rent & Utility Collections</h2>
      <p className="portal-muted" style={{ marginBottom: 14 }}>
        Totals for rent and utility payments collected over a selected period.
      </p>

      <div className="portal-entity-form" style={{ marginBottom: 16 }}>
        <div className="portal-entity-grid-3">
          <label>
            <span>From</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label>
            <span>Currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="KES">KES</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <button type="button" className="portal-primary-btn" onClick={() => void loadReport()} disabled={loading || !token}>
          {loading ? 'Loading...' : 'Run Collections Report'}
        </button>
      </div>

      {error ? <p className="portal-error">{error}</p> : null}

      {report ? (
        <>
          <div className="portal-payment-summary-grid">
            <div>
              <span>Period</span>
              <strong>
                {report.from} → {report.to}
              </strong>
            </div>
            <div>
              <span>Grand Total ({report.currency})</span>
              <strong>{formatMoney(report.grandTotal, report.currency)}</strong>
            </div>
            <div>
              <span>Transactions</span>
              <strong>{report.paymentCount}</strong>
            </div>
          </div>

          <h3 style={{ margin: '18px 0 10px', fontSize: 16 }}>By Category</h3>
          <div className="portal-list-stack">
            {report.byCategory.length === 0 ? (
              <div className="portal-empty-state">No rent/utility payments in this period.</div>
            ) : (
              report.byCategory.map((item) => (
                <div key={item.category} className="portal-record">
                  <div className="portal-list-row">
                    <div>
                      <strong>{item.category.replaceAll('_', ' ')}</strong>
                      <p>
                        {item.count} payment{item.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span>{report.currency}</span>
                    <span>{formatMoney(item.total, report.currency)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {report.byMonth.length > 0 ? (
            <>
              <h3 style={{ margin: '18px 0 10px', fontSize: 16 }}>By Month</h3>
              <div className="portal-list-stack">
                {report.byMonth.map((item) => (
                  <div key={item.month} className="portal-record">
                    <div className="portal-list-row">
                      <div>
                        <strong>{item.month}</strong>
                        <p>
                          {Object.entries(item.byCategory)
                            .map(([category, total]) => `${category}: ${formatMoney(total, report.currency)}`)
                            .join(' • ')}
                        </p>
                      </div>
                      <span>TOTAL</span>
                      <span>{formatMoney(item.total, report.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
