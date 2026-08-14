"use client";

/**
 * The analytics workspace: portfolio-level charts, then a per-project drill-down.
 *
 * Extracted from portal/page.tsx rather than added to it -- that file is already
 * ~4,900 lines, and this view is self-contained given the computed analytics
 * object.
 *
 * Every chart here is driven by data the system already collects. Where a
 * measure and its comparison are on different scales they get separate charts;
 * there is no dual-axis anywhere, which is the most common way a chart like
 * this goes wrong.
 */

import { useState } from 'react';
import { perSqftFromPerSqm } from '../../lib/area';
import { PrintReportButton } from '../components/print-report';
import Link from 'next/link';
import {
  BarChart,
  ChartFrame,
  RankedBars,
  RateMeter,
  StackedBar,
  TrendChart,
  CHART_CATEGORICAL,
} from './charts';

type ProjectRow = {
  projectId: string;
  code: string;
  name: string;
  location: string | null;
  blockCount: number;
  unitCount: number;
  sold: number;
  reserved: number;
  available: number;
  blocked: number;
  inventoryValue: number;
  soldValue: number;
  contractValue: number;
  collected: number;
  projectSqm: number;
  bedroomMix: Record<string, number>;
  averageUnitPrice: number;
  pricePerSqm: number;
  outstanding: number;
  absorption: number;
  collectionRate: number;
};

export type AnalyticsData = {
  totalContractValue: number;
  totalCollected: number;
  outstandingBalance: number;
  collectionRate: number;
  unitsWithOwnership: number;
  ownershipCoverage: number;
  paymentsByMethod: Record<string, number>;
  paymentValueByMethod: Record<string, number>;
  statusCounts: Record<string, number>;
  cancelledContracts: number;
  activeContractCount: number;
  totalInventoryValue: number;
  availableInventoryValue: number;
  soldInventoryValue: number;
  averagePricePerSqm: number;
  averageUnitPrice: number;
  totalSqm: number;
  absorptionRate: number;
  projectBreakdown: ProjectRow[];
  monthlyCollections: Array<{ key: string; label: string; amount: number }>;
  peakMonthlyCollection: number;
  bedroomMix: Record<string, number>;
  topCustomers: Array<{ customerId: string; name: string; value: number; share: number }>;
  averageContractValue: number;
  averagePaymentSize: number;
  monthlySales: Array<{ key: string; label: string; amount: number }>;
  cadence: { current: number; days30: number; days60: number; days90plus: number; never: number };
  completionBands: {
    notStarted: number;
    under25: number;
    under50: number;
    under75: number;
    under100: number;
    settled: number;
  };
  priceBandMix: Array<{ label: string; total: number; sold: number }>;
  floorPerformance: Array<{ label: string; total: number; sold: number; absorption: number }>;
  revenueAtRisk: number;
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  RENTED: 'Rented',
  BLOCKED: 'Blocked',
};

export function AnalyticsView({
  analytics,
  formatCurrency,
  formatCompactCurrency,
}: {
  analytics: AnalyticsData;
  formatCurrency: (value: number) => string;
  formatCompactCurrency: (value: number) => string;
}) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const project = analytics.projectBreakdown.find((row) => row.projectId === selectedProject) || null;

  const money = (value: number) => formatCompactCurrency(value);

  const statusSegments = Object.entries(analytics.statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count], index) => ({
      label: STATUS_LABELS[status] || status,
      value: count,
      color: CHART_CATEGORICAL[index % CHART_CATEGORICAL.length],
    }));

  const methodSegments = Object.entries(analytics.paymentValueByMethod)
    .sort((a, b) => b[1] - a[1])
    .map(([method, value], index) => ({
      label: method.replace(/_/g, ' '),
      value,
      color: CHART_CATEGORICAL[index % CHART_CATEGORICAL.length],
    }));

  // Ordered buckets: sequential ramp, light to dark, not categorical hues.
  const cadenceSegments = [
    { label: 'Paid < 30d', value: analytics.cadence.current, color: 'var(--chart-seq-1)' },
    { label: '30-60d', value: analytics.cadence.days30, color: 'var(--chart-seq-2)' },
    { label: '60-90d', value: analytics.cadence.days60, color: 'var(--chart-seq-3)' },
    { label: '90d+', value: analytics.cadence.days90plus, color: 'var(--chart-seq-4)' },
    { label: 'Never paid', value: analytics.cadence.never, color: 'var(--chart-seq-5)' },
  ];

  const completionSegments = [
    { label: 'Not started', value: analytics.completionBands.notStarted, color: 'var(--chart-seq-5)' },
    { label: 'Under 25%', value: analytics.completionBands.under25, color: 'var(--chart-seq-4)' },
    { label: '25-50%', value: analytics.completionBands.under50, color: 'var(--chart-seq-3)' },
    { label: '50-75%', value: analytics.completionBands.under75, color: 'var(--chart-seq-2)' },
    { label: '75-99%', value: analytics.completionBands.under100, color: 'var(--chart-seq-1)' },
    { label: 'Settled', value: analytics.completionBands.settled, color: 'var(--chart-good)' },
  ];

  const bedroomEntries = Object.entries(analytics.bedroomMix).sort((a, b) => b[1] - a[1]);

  return (
    <section className="portal-stack-grid">
      <article className="portal-card portal-analytics-hero">
        <div className="portal-card-header-row">
          <div>
            <p className="portal-kicker">Portfolio Analytics</p>
            <h2 style={{ margin: '4px 0 0' }}>Commercial Overview</h2>
          </div>
          <div className="portal-action-row no-print">
            <PrintReportButton documentTitle="Portfolio Analytics" />
            <Link href="/portal/accounting/reports" className="portal-inline-btn">
              Financial Reports
            </Link>
          </div>
        </div>
        <p className="portal-muted" style={{ margin: '8px 0 0' }}>
          Contract value, collections and inventory across every project. Figures exclude cancelled
          contracts.
        </p>
      </article>

      {/* Headline figures. A stat tile is the right form for a single number --
          these are not charts pretending to be. */}
      <div className="portal-stat-grid">
        <article className="portal-card portal-stat-card">
          <p>Contract Value</p>
          <h3 title={formatCurrency(analytics.totalContractValue)}>
            {money(analytics.totalContractValue)}
          </h3>
          <span className="portal-stat-note">{analytics.activeContractCount} active contracts</span>
        </article>
        <article className="portal-card portal-stat-card">
          <p>Collected</p>
          <h3 title={formatCurrency(analytics.totalCollected)}>{money(analytics.totalCollected)}</h3>
          <span className="portal-stat-note">
            {analytics.collectionRate.toFixed(1)}% of contract value
          </span>
        </article>
        <article className="portal-card portal-stat-card">
          <p>Outstanding</p>
          <h3 title={formatCurrency(analytics.outstandingBalance)}>
            {money(analytics.outstandingBalance)}
          </h3>
          <span className="portal-stat-note">Due across active contracts</span>
        </article>
        <article className="portal-card portal-stat-card">
          <p>Revenue at Risk</p>
          <h3 title={formatCurrency(analytics.revenueAtRisk)}>{money(analytics.revenueAtRisk)}</h3>
          <span className="portal-stat-note">On contracts quiet 90+ days</span>
        </article>
        <article className="portal-card portal-stat-card">
          <p>Inventory Value</p>
          <h3 title={formatCurrency(analytics.totalInventoryValue)}>
            {money(analytics.totalInventoryValue)}
          </h3>
          <span className="portal-stat-note">
            {money(analytics.availableInventoryValue)} still available
          </span>
        </article>
        <article className="portal-card portal-stat-card">
          <p>Avg Unit Price</p>
          <h3 title={formatCurrency(analytics.averageUnitPrice)}>
            {money(analytics.averageUnitPrice)}
          </h3>
          <span className="portal-stat-note">
            {money(perSqftFromPerSqm(analytics.averagePricePerSqm))} per sq ft
          </span>
        </article>
      </div>

      <div className="chart-grid-layout">
        <ChartFrame
          title="Collections by month"
          subtitle="Payments received over the last six months."
          table={{
            headers: ['Month', 'Collected'],
            rows: analytics.monthlyCollections.map((m) => [m.label, formatCurrency(m.amount)]),
          }}
        >
          <TrendChart
            data={analytics.monthlyCollections.map((m) => ({ label: m.label, value: m.amount }))}
            valueFormat={money}
          />
        </ChartFrame>

        {/* Sales count and collected value are different scales, so they are
            two charts rather than one with two y-axes. */}
        <ChartFrame
          title="Sales velocity"
          subtitle="Contracts with their first payment in each month."
          table={{
            headers: ['Month', 'Contracts'],
            rows: analytics.monthlySales.map((m) => [m.label, m.amount]),
          }}
        >
          <BarChart
            data={analytics.monthlySales.map((m) => ({ label: m.label, value: m.amount }))}
            color="var(--chart-cat-2)"
            valueFormat={(v) => v.toFixed(0)}
          />
        </ChartFrame>

        <ChartFrame
          title="Unit status"
          subtitle="Where the inventory stands right now."
          table={{
            headers: ['Status', 'Units'],
            rows: statusSegments.map((s) => [s.label, s.value]),
          }}
        >
          <StackedBar segments={statusSegments} valueFormat={(v) => v.toFixed(0)} />
        </ChartFrame>

        <ChartFrame
          title="Payment cadence"
          subtitle="How recently each active contract last paid. Contracts quiet past 90 days are where collection effort belongs."
          table={{
            headers: ['Last payment', 'Contracts'],
            rows: cadenceSegments.map((s) => [s.label, s.value]),
          }}
        >
          <StackedBar segments={cadenceSegments} valueFormat={(v) => v.toFixed(0)} />
        </ChartFrame>

        <ChartFrame
          title="Contract completion"
          subtitle="How far through their balance contracts are. An average would hide this shape."
          table={{
            headers: ['Band', 'Contracts'],
            rows: completionSegments.map((s) => [s.label, s.value]),
          }}
        >
          <StackedBar segments={completionSegments} valueFormat={(v) => v.toFixed(0)} />
        </ChartFrame>

        <ChartFrame
          title="Where money arrives"
          subtitle="Payment value by method, not just receipt count."
          table={{
            headers: ['Method', 'Value', 'Receipts'],
            rows: methodSegments.map((s) => [
              s.label,
              formatCurrency(s.value),
              analytics.paymentsByMethod[s.label.replace(/ /g, '_')] ?? '—',
            ]),
          }}
        >
          <StackedBar segments={methodSegments} valueFormat={money} />
        </ChartFrame>

        <ChartFrame
          title="Stock by price band"
          subtitle="Total units against those sold, which shows where demand actually sits."
          legend={[
            { label: 'Total units', color: 'var(--chart-cat-2)' },
            { label: 'Sold', color: 'var(--chart-cat-4)' },
          ]}
          table={{
            headers: ['Band (KES)', 'Total', 'Sold'],
            rows: analytics.priceBandMix.map((b) => [b.label, b.total, b.sold]),
          }}
        >
          <BarChart
            data={analytics.priceBandMix.map((b) => ({
              label: b.label,
              value: b.total,
              hint: `${b.sold} sold`,
            }))}
            color="var(--chart-cat-2)"
            valueFormat={(v) => v.toFixed(0)}
          />
        </ChartFrame>

        <ChartFrame
          title="Absorption by floor"
          subtitle="Whether the premium on higher floors is actually selling."
          table={{
            headers: ['Floor', 'Units', 'Sold', 'Absorption'],
            rows: analytics.floorPerformance.map((f) => [
              f.label,
              f.total,
              f.sold,
              `${f.absorption.toFixed(0)}%`,
            ]),
          }}
        >
          <BarChart
            data={analytics.floorPerformance.map((f) => ({
              label: f.label,
              value: f.absorption,
              hint: `${f.sold} of ${f.total}`,
            }))}
            color="var(--chart-cat-4)"
            valueFormat={(v) => `${v.toFixed(0)}%`}
          />
        </ChartFrame>

        <ChartFrame
          title="Unit mix"
          subtitle="Bedroom configuration across the portfolio."
          table={{
            headers: ['Configuration', 'Units'],
            rows: bedroomEntries.map(([label, count]) => [label, count]),
          }}
        >
          <BarChart
            data={bedroomEntries.map(([label, count]) => ({ label, value: count }))}
            color="var(--chart-cat-5)"
            valueFormat={(v) => v.toFixed(0)}
          />
        </ChartFrame>

        <ChartFrame
          title="Customer concentration"
          subtitle="Reliance on a handful of buyers is a real risk that totals alone hide."
          table={{
            headers: ['Customer', 'Contract value', 'Share'],
            rows: analytics.topCustomers.map((c) => [
              c.name,
              formatCurrency(c.value),
              `${c.share.toFixed(1)}%`,
            ]),
          }}
        >
          <RankedBars
            data={analytics.topCustomers.map((c) => ({
              label: c.name,
              value: c.value,
              sublabel: `${c.share.toFixed(1)}% of contract value`,
            }))}
            valueFormat={money}
          />
        </ChartFrame>

        <ChartFrame
          title="Project contract value"
          subtitle="Ranked by committed value. Select a project below for its own breakdown."
          table={{
            headers: ['Project', 'Contract value', 'Collected', 'Outstanding'],
            rows: analytics.projectBreakdown.map((p) => [
              p.code,
              formatCurrency(p.contractValue),
              formatCurrency(p.collected),
              formatCurrency(p.outstanding),
            ]),
          }}
        >
          <RankedBars
            data={analytics.projectBreakdown.slice(0, 6).map((p) => ({
              label: p.code,
              value: p.contractValue,
              sublabel: `${money(p.collected)} collected · ${p.collectionRate.toFixed(0)}% of value`,
            }))}
            color="var(--chart-cat-2)"
            valueFormat={money}
          />
        </ChartFrame>

        <ChartFrame
          title="Portfolio health"
          subtitle="The three rates worth watching together."
        >
          <div style={{ display: 'grid', gap: 18 }}>
            <RateMeter value={analytics.collectionRate} label="Collection rate — cash against contract value" />
            <RateMeter value={analytics.absorptionRate} label="Absorption — units no longer available" />
            <RateMeter value={analytics.ownershipCoverage} label="Ownership coverage — units with a recorded owner" />
          </div>
        </ChartFrame>
      </div>

      {/* ---- Per-project drill-down ------------------------------------- */}
      <article className="portal-card">
        <div className="portal-card-header-row" style={{ marginBottom: 14 }}>
          <div>
            <p className="portal-kicker">Per project</p>
            <h2 style={{ margin: '4px 0 0' }}>Project detail</h2>
            <p className="portal-muted" style={{ margin: '6px 0 0' }}>
              Pick a project to see its inventory, absorption and collections on their own.
            </p>
          </div>
        </div>

        <div className="project-picker">
          <button
            type="button"
            className={`project-picker-chip${selectedProject === null ? ' is-active' : ''}`}
            onClick={() => setSelectedProject(null)}
          >
            All projects
          </button>
          {analytics.projectBreakdown.map((row) => (
            <button
              key={row.projectId}
              type="button"
              className={`project-picker-chip${selectedProject === row.projectId ? ' is-active' : ''}`}
              onClick={() => setSelectedProject(row.projectId)}
            >
              {row.code}
            </button>
          ))}
        </div>
      </article>

      {project ? (
        <>
          <article className="portal-card">
            <div className="portal-card-header-row">
              <div>
                <p className="portal-kicker">{project.code}</p>
                <h2 style={{ margin: '4px 0 0' }}>{project.name}</h2>
                <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                  {project.location || 'Location not set'} · {project.blockCount} block
                  {project.blockCount === 1 ? '' : 's'} · {project.unitCount} unit
                  {project.unitCount === 1 ? '' : 's'}
                </p>
              </div>
              <Link href={`/portal/projects/${project.projectId}`} className="portal-inline-btn">
                Open project
              </Link>
            </div>
          </article>

          <div className="portal-stat-grid">
            <article className="portal-card portal-stat-card">
              <p>Contract Value</p>
              <h3 title={formatCurrency(project.contractValue)}>{money(project.contractValue)}</h3>
              <span className="portal-stat-note">{money(project.collected)} collected</span>
            </article>
            <article className="portal-card portal-stat-card">
              <p>Outstanding</p>
              <h3 title={formatCurrency(project.outstanding)}>{money(project.outstanding)}</h3>
              <span className="portal-stat-note">
                {project.collectionRate.toFixed(1)}% of value collected
              </span>
            </article>
            <article className="portal-card portal-stat-card">
              <p>Inventory Value</p>
              <h3 title={formatCurrency(project.inventoryValue)}>{money(project.inventoryValue)}</h3>
              <span className="portal-stat-note">{money(project.soldValue)} sold</span>
            </article>
            <article className="portal-card portal-stat-card">
              <p>Avg Unit Price</p>
              <h3 title={formatCurrency(project.averageUnitPrice)}>
                {money(project.averageUnitPrice)}
              </h3>
              <span className="portal-stat-note">
                {money(perSqftFromPerSqm(project.pricePerSqm))} per sq ft
              </span>
            </article>
          </div>

          <div className="chart-grid-layout">
            <ChartFrame
              title="Inventory status"
              subtitle={`${project.unitCount} units across ${project.blockCount} block${project.blockCount === 1 ? '' : 's'}.`}
              table={{
                headers: ['Status', 'Units'],
                rows: [
                  ['Sold', project.sold],
                  ['Reserved', project.reserved],
                  ['Available', project.available],
                  ['Blocked', project.blocked],
                ],
              }}
            >
              <StackedBar
                segments={[
                  { label: 'Sold', value: project.sold, color: CHART_CATEGORICAL[0] },
                  { label: 'Reserved', value: project.reserved, color: CHART_CATEGORICAL[1] },
                  { label: 'Available', value: project.available, color: CHART_CATEGORICAL[2] },
                  { label: 'Blocked', value: project.blocked, color: CHART_CATEGORICAL[3] },
                ]}
                valueFormat={(v) => v.toFixed(0)}
              />
            </ChartFrame>

            <ChartFrame title="Project health" subtitle="Absorption and collection for this project alone.">
              <div style={{ display: 'grid', gap: 18 }}>
                <RateMeter value={project.absorption} label="Absorption — sold or reserved" />
                <RateMeter value={project.collectionRate} label="Collection rate" />
              </div>
            </ChartFrame>

            <ChartFrame
              title="Unit mix"
              subtitle="Bedroom configuration in this project."
              table={{
                headers: ['Configuration', 'Units'],
                rows: Object.entries(project.bedroomMix).map(([label, count]) => [label, count]),
              }}
            >
              <BarChart
                data={Object.entries(project.bedroomMix)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, count]) => ({ label, value: count }))}
                color="var(--chart-cat-5)"
                valueFormat={(v) => v.toFixed(0)}
              />
            </ChartFrame>
          </div>
        </>
      ) : (
        <ChartFrame
          title="All projects"
          subtitle="Contract value, collections and absorption side by side."
          table={{
            headers: ['Project', 'Units', 'Sold', 'Contract value', 'Collected', 'Absorption'],
            rows: analytics.projectBreakdown.map((p) => [
              `${p.code} — ${p.name}`,
              p.unitCount,
              p.sold,
              formatCurrency(p.contractValue),
              formatCurrency(p.collected),
              `${p.absorption.toFixed(0)}%`,
            ]),
          }}
        >
          <RankedBars
            data={analytics.projectBreakdown.map((p) => ({
              label: `${p.code} — ${p.name}`,
              value: p.absorption,
              sublabel: `${p.sold} sold, ${p.reserved} reserved of ${p.unitCount} units · ${money(p.contractValue)} contracted`,
            }))}
            color="var(--chart-cat-4)"
            valueFormat={(v) => `${v.toFixed(0)}%`}
          />
        </ChartFrame>
      )}
    </section>
  );
}
