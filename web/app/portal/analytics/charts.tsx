"use client";

/**
 * Chart primitives for the analytics section.
 *
 * Hand-built SVG rather than a charting library: web/ ships with only next,
 * react and react-dom, and adding Recharts (~90kB gzipped) for six charts is a
 * poor trade when each one is 40 lines of path maths.
 *
 * Colour comes from CSS custom properties defined in globals.css
 * (--chart-cat-1..5, --chart-seq-1..5, --chart-good/warn/bad). Both light and
 * dark sets were validated with the dataviz palette validator: five
 * categorical slots, all passing the lightness band, chroma floor, CVD
 * separation and normal-vision floor. The amber slot sits below 3:1 contrast
 * on the light surface, which is why every series here carries a visible label
 * or legend and each chart has a table view -- that relief is required, not
 * optional.
 */

import { useId, useState } from 'react';

export const CHART_CATEGORICAL = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
];

export function formatCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

/** Wraps a chart with its title, optional legend, and a toggleable data table. */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: Array<{ label: string; color: string }>;
  table?: { headers: string[]; rows: Array<Array<string | number>> };
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <article className="portal-card chart-card">
      <header className="chart-card-head">
        <div>
          <h3 className="chart-title">{title}</h3>
          {subtitle ? <p className="chart-subtitle">{subtitle}</p> : null}
        </div>
        {table ? (
          <button
            type="button"
            className="chart-table-toggle"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            aria-controls={tableId}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        ) : null}
      </header>

      {legend && legend.length > 1 ? (
        <ul className="chart-legend">
          {legend.map((item) => (
            <li key={item.label}>
              <span className="chart-swatch" style={{ background: item.color }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      {showTable && table ? (
        <div className="chart-table-wrap" id={tableId}>
          <table className="chart-table">
            <thead>
              <tr>
                {table.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-body">{children}</div>
      )}
    </article>
  );
}

/**
 * Vertical bars with an optional target line. Values are labelled on every bar
 * -- with six or fewer bars that is legible, and it is the relief the amber
 * slot's contrast warning requires.
 */
export function BarChart({
  data,
  height = 180,
  color = 'var(--chart-cat-1)',
  valueFormat = formatCompact,
}: {
  data: Array<{ label: string; value: number; hint?: string }>;
  height?: number;
  color?: string;
  valueFormat?: (value: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 100 / Math.max(data.length, 1);

  return (
    <div className="chart-bars" style={{ height }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div
            className="chart-bar-col"
            key={d.label}
            style={{ width: `${barW}%` }}
            title={`${d.label}: ${valueFormat(d.value)}${d.hint ? ` — ${d.hint}` : ''}`}
          >
            <span className="chart-bar-value">{valueFormat(d.value)}</span>
            <div className="chart-bar-track">
              <div
                className="chart-bar-fill"
                style={{ height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, background: color }}
              />
            </div>
            <span className="chart-bar-label">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Single-series area + line over time. One measure only -- a second y-scale is
 * never correct, so a second measure gets its own chart.
 */
export function TrendChart({
  data,
  height = 190,
  color = 'var(--chart-cat-1)',
  valueFormat = formatCompact,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
  valueFormat?: (value: number) => string;
}) {
  const gradientId = useId().replace(/:/g, '');
  if (data.length === 0) return <p className="chart-empty">No data for this period yet.</p>;

  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 100;
  const H = 100;
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: data.length === 1 ? W / 2 : i * step,
    y: H - (d.value / max) * (H - 12),
    ...d,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;

  return (
    <div className="chart-trend" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} className="chart-grid-line" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Markers and labels sit outside the stretched SVG so they stay circular
          and the text stays unskewed by preserveAspectRatio="none". */}
      <div className="chart-trend-points">
        {points.map((p, i) => (
          <div
            className="chart-trend-point"
            key={`${p.label}-${i}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: color }}
            title={`${p.label}: ${valueFormat(p.value)}`}
          />
        ))}
      </div>
      <div className="chart-trend-axis">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal stacked bar for a part-to-whole split. A 2px surface gap between
 * segments keeps adjacent fills legible without relying on colour alone.
 */
export function StackedBar({
  segments,
  valueFormat = formatCompact,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  valueFormat?: (value: number) => string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <p className="chart-empty">Nothing recorded yet.</p>;

  return (
    <div className="chart-stack">
      <div className="chart-stack-track">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              className="chart-stack-seg"
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${valueFormat(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}
            />
          ))}
      </div>
      <ul className="chart-stack-key">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="chart-swatch" style={{ background: s.color }} aria-hidden />
            <span className="chart-stack-key-label">{s.label}</span>
            <span className="chart-stack-key-value">
              {valueFormat(s.value)}
              <span className="chart-stack-key-share">
                {total > 0 ? ` · ${((s.value / total) * 100).toFixed(0)}%` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ranked horizontal bars -- the right form for "which projects/customers are
 * biggest", where labels are long and order is the message.
 */
export function RankedBars({
  data,
  color = 'var(--chart-cat-1)',
  valueFormat = formatCompact,
}: {
  data: Array<{ label: string; value: number; sublabel?: string }>;
  color?: string;
  valueFormat?: (value: number) => string;
}) {
  if (data.length === 0) return <p className="chart-empty">Nothing to rank yet.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="chart-ranked">
      {data.map((d) => (
        <li key={d.label}>
          <div className="chart-ranked-head">
            <span className="chart-ranked-label" title={d.label}>
              {d.label}
            </span>
            <span className="chart-ranked-value">{valueFormat(d.value)}</span>
          </div>
          <div className="chart-ranked-track">
            <div
              className="chart-ranked-fill"
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0)}%`, background: color }}
            />
          </div>
          {d.sublabel ? <span className="chart-ranked-sub">{d.sublabel}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Progress meter for a single rate. Semantic colour by band -- good/warning/
 * critical are reserved for state and never reused as a series colour.
 */
export function RateMeter({
  value,
  label,
  goodAbove = 75,
  warnAbove = 50,
}: {
  value: number;
  label?: string;
  goodAbove?: number;
  warnAbove?: number;
}) {
  const clamped = Math.max(0, Math.min(value, 100));
  const tone =
    value >= goodAbove ? 'var(--chart-good)' : value >= warnAbove ? 'var(--chart-warn)' : 'var(--chart-bad)';
  const state = value >= goodAbove ? 'On track' : value >= warnAbove ? 'Watch' : 'Behind';

  return (
    <div className="chart-meter">
      <div className="chart-meter-head">
        <span className="chart-meter-value">{value.toFixed(1)}%</span>
        {/* State is spelled out, never colour alone. */}
        <span className="chart-meter-state" style={{ color: tone }}>
          {state}
        </span>
      </div>
      <div className="chart-meter-track">
        <div className="chart-meter-fill" style={{ width: `${clamped}%`, background: tone }} />
      </div>
      {label ? <span className="chart-meter-label">{label}</span> : null}
    </div>
  );
}
