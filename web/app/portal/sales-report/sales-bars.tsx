"use client";

/**
 * Revenue per hour, day, week or month. Bars, not a line: each is a separate total, and a line would draw a slope through the days nothing
 * sold. One series, so no legend. A light scale on the left, only the best bar carries its figure, and pointing at (or tabbing to) any bar
 * shows that period's revenue and sales; the same numbers are in the table below the chart. Colour is the portal's first chart colour.
 */
import { useState } from 'react';
import { formatMoney } from '../accounting/lib';

export type SalesBar = { key: string; label: string; short: string; revenue: number; sales: number };

/** 4,500 reads as 4.5K: the shared compact format rounds to whole thousands, which would label a 2,500 gridline "3K". */
const compact = (v: number) => (v >= 1_000_000 ? `${Number((v / 1_000_000).toFixed(2))}M` : v >= 1000 ? `${Number((v / 1000).toFixed(2))}K` : `${Number(v.toFixed(1))}`);

/** A round number at or above the largest bar, so the scale reads in sensible steps. */
export function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((v) => v >= max) ?? max;
}

export function SalesBars({ data, onPick }: { data: SalesBar[]; onPick?: (key: string) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceCeiling(Math.max(...data.map((d) => d.revenue), 0));
  const best = data.reduce((at, d, i) => (d.revenue > (data[at]?.revenue ?? -1) ? i : at), 0);
  const every = Math.max(1, Math.ceil(data.length / 8));
  const shown = active !== null ? data[active] : null;

  return (
    <figure className="srp-chart">
      <div className="srp-chart-readout" aria-live="polite">
        {shown ? <><strong>{shown.label}</strong>: {formatMoney(shown.revenue)} · {shown.sales} sale{shown.sales === 1 ? '' : 's'}</> : <span className="portal-muted">Point at a bar for its figures.</span>}
      </div>
      <div className="srp-chart-body">
        <div className="srp-chart-scale" aria-hidden="true"><span>{compact(top)}</span><span>{compact(top / 2)}</span><span>0</span></div>
        <div className="srp-chart-plot" onMouseLeave={() => setActive(null)}>
          {data.map((d, i) => (
            <button
              key={d.key} type="button" className={`srp-bar-col${active === i ? ' is-active' : ''}`}
              aria-label={`${d.label}: ${formatMoney(d.revenue)}, ${d.sales} sales`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onClick={() => { if (active === i && onPick) onPick(d.key); else setActive(i); }}
            >
              <span className="srp-bar-fill" style={{ height: `${d.revenue > 0 ? Math.max((d.revenue / top) * 100, 1.5) : 0}%` }}>
                {i === best && d.revenue > 0 ? <span className="srp-bar-label">{compact(d.revenue)}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="srp-chart-axis" aria-hidden="true">
        {data.map((d, i) => <span key={d.key}>{i % every === 0 ? <em>{d.short}</em> : null}</span>)}
      </div>
    </figure>
  );
}
