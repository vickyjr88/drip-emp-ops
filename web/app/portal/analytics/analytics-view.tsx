"use client";

/**
 * The analytics workspace.
 *
 * Built from the reporting endpoints rather than a dedicated analytics API:
 * store performance, product margin and consignment exposure already answer
 * the questions a shop owner asks, and sourcing the figures from the same
 * place as the accounting reports means the two can never disagree.
 *
 * What replaced what: this screen used to chart a property portfolio --
 * blocks, units, absorption and floor area. None of that survives; the
 * questions here are which shop is making money, which shoes carry the
 * margin, and what is sitting with resellers.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { useErrorState } from '../components/notifications';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';
import { BarChart, ChartFrame, RankedBars, RateMeter, formatCompact } from './charts';

type StoreRow = {
  storeId: string;
  code: string;
  name: string;
  orderCount: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  collected: number;
  outstanding: number;
};

type ProductRow = {
  productId: string;
  name: string;
  brand: string | null;
  unitsSold: number;
  revenue: number;
  cost: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  discount: number;
  averagePrice: number | null;
};

type ConsignmentRow = {
  consignmentId: string;
  reference: string;
  resellerName: string;
  storeName: string;
  daysOut: number;
  unitsStillOut: number;
  stockAtRisk: number;
  balance: number;
  overdue: boolean;
};

type SalesSummary = {
  orderCount: number;
  revenue: number;
  collected: number;
  outstanding: number;
  averageOrderValue: number;
};

function percentLabel(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;
}

export function AnalyticsView() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [, setErrorMessage] = useErrorState();

  const [stores, setStores] = useState<{ rows: StoreRow[]; totals: any } | null>(null);
  const [products, setProducts] = useState<{ rows: ProductRow[]; totals: any; costIncomplete: boolean } | null>(null);
  const [consignment, setConsignment] = useState<{ rows: ConsignmentRow[]; totals: any } | null>(null);
  const [summary, setSummary] = useState<SalesSummary | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const init = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);

      // Each panel is fetched independently and allowed to fail on its own: a
      // missing permission on one report should leave the rest of the screen
      // working rather than blanking it.
      const load = async <T,>(path: string, permission: string): Promise<T | null> => {
        if (!hasPermission(nextProfile, permission)) return null;
        try {
          return await apiRequest<T>(path, { method: 'GET' }, authToken);
        } catch {
          return null;
        }
      };

      const [nextStores, nextProducts, nextConsignment, nextSummary] = await Promise.all([
        load<any>('/reports/store-performance', 'journal-entry.read'),
        load<any>('/reports/product-profitability', 'journal-entry.read'),
        load<any>('/reports/consignment-exposure', 'journal-entry.read'),
        load<SalesSummary>('/orders/summary', 'order.read'),
      ]);

      setStores(nextStores);
      setProducts(nextProducts);
      setConsignment(nextConsignment);
      setSummary(nextSummary);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized || !token) {
      if (initialized) setLoading(false);
      return;
    }
    void init(token);
  }, [initialized, token, init]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading analytics...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card">
              <h2>Authentication required</h2>
              <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const storeRows = stores?.rows || [];
  const productRows = products?.rows || [];
  const consignmentRows = consignment?.rows || [];
  const storeTotals = stores?.totals || {};
  const productTotals = products?.totals || {};
  const consignmentTotals = consignment?.totals || {};

  const nothingYet = !storeRows.length && !productRows.length && !consignmentRows.length;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="analytics"
            pageTitle="Analytics"
            pageSubtitle="Which shop is making money, which shoes carry the margin, and what is out with resellers."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {nothingYet ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Nothing to analyse yet</h2>
                <p className="portal-muted">
                  Once orders are taken these charts fill in on their own. Nothing to set up.
                </p>
                <Link href="/portal/orders" className="portal-inline-btn">
                  Go to Orders
                </Link>
              </article>
            ) : (
              <>
                {/* ---- Headline ------------------------------------------- */}
                <div className="portal-stat-grid" style={{ marginBottom: 20 }}>
                  <div className="portal-stat">
                    <span>Revenue</span>
                    <h3>{formatMoney(storeTotals.revenue ?? 0)}</h3>
                    <span className="portal-stat-note">
                      {storeTotals.orderCount ?? 0} order{storeTotals.orderCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="portal-stat">
                    <span>Gross profit</span>
                    <h3>{formatMoney(storeTotals.grossProfit ?? 0)}</h3>
                    <span className="portal-stat-note">
                      {percentLabel(storeTotals.grossMarginPercent)} margin
                    </span>
                  </div>
                  <div className="portal-stat">
                    <span>Collected</span>
                    <h3>{formatMoney(summary?.collected ?? 0)}</h3>
                    <span className="portal-stat-note">
                      {formatMoney(summary?.outstanding ?? 0)} still owed
                    </span>
                  </div>
                  <div className="portal-stat">
                    <span>Out with resellers</span>
                    <h3>{formatMoney(consignmentTotals.stockAtRisk ?? 0)}</h3>
                    <span className="portal-stat-note">
                      {consignmentTotals.unitsStillOut ?? 0} pair
                      {consignmentTotals.unitsStillOut === 1 ? '' : 's'}
                      {consignmentTotals.overdueCount
                        ? ` · ${consignmentTotals.overdueCount} overdue`
                        : ''}
                    </span>
                  </div>
                </div>

                {/* Shown when any variant sold has no cost on file, because
                    every margin on this page then reads higher than it is. */}
                {products?.costIncomplete ? (
                  <article className="portal-card" style={{ marginBottom: 20 }}>
                    <p style={{ margin: 0 }} className="portal-muted">
                      Some items sold have no cost recorded, so the margins below are higher than the
                      real ones. Set a cost on those variants in the catalogue for a true figure.
                    </p>
                  </article>
                ) : null}

                {/* ---- Stores ---------------------------------------------- */}
                {storeRows.length ? (
                  <div className="portal-detail-grid" style={{ marginBottom: 20 }}>
                    <ChartFrame
                      title="Revenue by store"
                      subtitle="Posted revenue, excluding cancelled and refunded orders."
                      table={{
                        headers: ['Store', 'Orders', 'Revenue', 'Gross profit', 'Margin'],
                        rows: storeRows.map((row) => [
                          row.name,
                          row.orderCount,
                          formatMoney(row.revenue),
                          formatMoney(row.grossProfit),
                          percentLabel(row.grossMarginPercent),
                        ]),
                      }}
                    >
                      <BarChart
                        data={storeRows.map((row) => ({
                          label: row.code,
                          value: row.revenue,
                          hint: `${row.name}: ${formatMoney(row.revenue)}`,
                        }))}
                        valueFormat={formatCompact}
                      />
                    </ChartFrame>

                    <ChartFrame
                      title="Gross margin by store"
                      subtitle="Revenue less cost of goods, as a percentage."
                      table={{
                        headers: ['Store', 'Revenue', 'Cost of goods', 'Margin'],
                        rows: storeRows.map((row) => [
                          row.name,
                          formatMoney(row.revenue),
                          formatMoney(row.cogs),
                          percentLabel(row.grossMarginPercent),
                        ]),
                      }}
                    >
                      <div className="analytics-meter-stack">
                        {storeRows.map((row) => (
                          <RateMeter
                            key={row.storeId}
                            value={row.grossMarginPercent ?? 0}
                            label={`${row.name} — ${percentLabel(row.grossMarginPercent)}`}
                            goodAbove={35}
                            warnAbove={20}
                          />
                        ))}
                      </div>
                    </ChartFrame>
                  </div>
                ) : null}

                {/* ---- Products -------------------------------------------- */}
                {productRows.length ? (
                  <div className="portal-detail-grid" style={{ marginBottom: 20 }}>
                    <ChartFrame
                      title="Top sellers by revenue"
                      subtitle="Ranked on what came in, not units moved."
                      table={{
                        headers: ['Product', 'Units', 'Revenue', 'Gross profit', 'Margin'],
                        rows: productRows.map((row) => [
                          row.name,
                          row.unitsSold,
                          formatMoney(row.revenue),
                          row.grossProfit === null ? '—' : formatMoney(row.grossProfit),
                          percentLabel(row.grossMarginPercent),
                        ]),
                      }}
                    >
                      <RankedBars
                        data={productRows.slice(0, 8).map((row) => ({
                          label: row.name,
                          value: row.revenue,
                          sublabel: `${row.unitsSold} sold · ${percentLabel(row.grossMarginPercent)} margin`,
                        }))}
                        valueFormat={formatCompact}
                      />
                    </ChartFrame>

                    <ChartFrame
                      title="Given away at the counter"
                      subtitle="Gap between the marked price and what was actually taken."
                      table={{
                        headers: ['Product', 'Avg price', 'Discount'],
                        rows: productRows.map((row) => [
                          row.name,
                          row.averagePrice === null ? '—' : formatMoney(row.averagePrice),
                          formatMoney(row.discount),
                        ]),
                      }}
                    >
                      {productRows.some((row) => row.discount !== 0) ? (
                        <RankedBars
                          data={productRows
                            .filter((row) => row.discount !== 0)
                            .slice(0, 8)
                            .map((row) => ({
                              label: row.name,
                              value: row.discount,
                              sublabel: `avg ${row.averagePrice === null ? '—' : formatMoney(row.averagePrice)}`,
                            }))}
                          valueFormat={formatCompact}
                          color="var(--chart-cat-3)"
                        />
                      ) : (
                        <p className="chart-empty">Everything sold at the marked price.</p>
                      )}
                    </ChartFrame>
                  </div>
                ) : null}

                {/* ---- Consignment ----------------------------------------- */}
                {consignmentRows.length ? (
                  <article className="portal-card">
                    <h2 style={{ marginTop: 0 }}>Out with resellers</h2>
                    <p className="portal-muted" style={{ marginTop: 0 }}>
                      Still ours, but not available to sell. Anything past three days is due back.
                    </p>
                    <div className="portal-table-wrap">
                      <table className="portal-data-table">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Reseller</th>
                            <th>Store</th>
                            <th className="portal-num">Days out</th>
                            <th className="portal-num">Pairs</th>
                            <th className="portal-num">At risk</th>
                            <th className="portal-num">Owed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {consignmentRows.map((row) => (
                            <tr key={row.consignmentId}>
                              <td>
                                {row.reference}
                                {row.overdue ? (
                                  <strong className="portal-overdue-flag">Overdue</strong>
                                ) : null}
                              </td>
                              <td>{row.resellerName}</td>
                              <td>{row.storeName}</td>
                              <td className="portal-num">{row.daysOut}</td>
                              <td className="portal-num">{row.unitsStillOut}</td>
                              <td className="portal-num">{formatMoney(row.stockAtRisk)}</td>
                              <td className="portal-num">{formatMoney(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ) : null}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
