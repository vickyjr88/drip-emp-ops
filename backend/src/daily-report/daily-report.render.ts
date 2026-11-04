import { escapeHtml } from '../email-log/email-html.util';
import { formatChange, formatMoney } from './daily-report.metrics';
import type { DailyReport } from './daily-report.types';

const INK = '#020721';
const MUTED = '#5b6480';
const LINE = '#dfe2f0';
const GOOD = '#0a7a3d';
const BAD = '#b3261e';

const money = (r: DailyReport, amount: number) => formatMoney(amount, r.currency);

function changeColour(change: number | null) {
  if (change === null || Math.round(change) === 0) return MUTED;
  return change > 0 ? GOOD : BAD;
}

function h3(text: string) {
  return `<h3 style="font-size:16px;margin:28px 0 8px;padding-top:16px;border-top:1px solid ${LINE};">${escapeHtml(text)}</h3>`;
}

function table(rows: string[][], header?: string[]) {
  const cell = (value: string, right: boolean, bold = false) =>
    `<td style="padding:6px 0;border-bottom:1px solid ${LINE};font-size:14px;${right ? 'text-align:right;' : ''}${bold ? 'font-weight:700;' : ''}">${value}</td>`;
  const head = header
    ? `<tr>${header.map((h, i) => `<td style="padding:4px 0;font-size:12px;color:${MUTED};${i > 0 ? 'text-align:right;' : ''}">${escapeHtml(h)}</td>`).join('')}</tr>`
    : '';
  const body = rows.map((r) => `<tr>${r.map((v, i) => cell(v, i > 0)).join('')}</tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${head}${body}</table>`;
}

function kpi(label: string, value: string, sub = '', subColour = MUTED) {
  return `<td style="width:50%;padding:0 8px 12px 0;vertical-align:top;">
    <div style="font-size:12px;color:${MUTED};">${escapeHtml(label)}</div>
    <div style="font-size:22px;font-weight:700;color:${INK};">${escapeHtml(value)}</div>
    ${sub ? `<div style="font-size:12px;color:${subColour};">${escapeHtml(sub)}</div>` : ''}
  </td>`;
}

export function reportSubject(r: DailyReport) {
  const t = r.today;
  const sales = t.confirmed === 0 ? 'no confirmed orders' : `${money(r, t.revenue)} from ${t.confirmed} order${t.confirmed === 1 ? '' : 's'}`;
  return `${r.shopName} daily report, ${r.label}: ${sales}`;
}

export function needsActionCount(r: DailyReport) {
  const a = r.needsAction;
  return a.paidAwaitingPacking.count + a.unpaidOver24h.count + a.pendingRefunds + a.newInquiries;
}

export function renderEmail(r: DailyReport): { subject: string; html: string } {
  const t = r.today;
  const day = r.vsPreviousDay;
  const week = r.vsLastWeek;
  const parts: string[] = [];

  parts.push(`<h2 style="font-size:20px;">${escapeHtml(r.shopName)}: ${escapeHtml(r.label)}</h2>`);

  parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>${kpi('Revenue (paid orders)', money(r, t.revenue), `${formatChange(day.revenueChange)} vs day before, ${formatChange(week.revenueChange)} vs last ${r.label.split(' ')[0]}`, changeColour(day.revenueChange))}${kpi('Paid orders', String(t.confirmed), `${t.orders} placed in all`)}</tr>
    <tr>${kpi('Items sold', String(t.items))}${kpi('Average order', t.confirmed ? money(r, t.averageOrder) : '-')}</tr>
    <tr>${kpi('Money received', money(r, t.collected), 'payments that arrived that day')}${kpi('Unpaid / cancelled', `${t.unpaid} / ${t.cancelled}`, 'placed that day')}</tr>
  </table>`);

  if (t.orders === 0) {
    parts.push(`<p style="color:${MUTED};">No orders were placed. If that is not expected, check that the site and checkout are working.</p>`);
  }

  // Needs action
  const a = r.needsAction;
  if (needsActionCount(r) > 0) {
    const items: string[] = [];
    if (a.paidAwaitingPacking.count) {
      const oldest = a.paidAwaitingPacking.oldest.map((o) => `${escapeHtml(o.orderNumber)} (${Math.round(o.ageHours)}h)`).join(', ');
      items.push(`<li><strong>${a.paidAwaitingPacking.count}</strong> paid order${a.paidAwaitingPacking.count === 1 ? '' : 's'} waiting to be packed. Oldest: ${oldest}</li>`);
    }
    if (a.unpaidOver24h.count) {
      const oldest = a.unpaidOver24h.oldest.map((o) => `${escapeHtml(o.orderNumber)} (${Math.round(o.ageHours)}h)`).join(', ');
      items.push(`<li><strong>${a.unpaidOver24h.count}</strong> order${a.unpaidOver24h.count === 1 ? '' : 's'} unpaid for over 24 hours (${money(r, a.unpaidOver24h.value)}). Oldest: ${oldest}</li>`);
    }
    if (a.pendingRefunds) items.push(`<li><strong>${a.pendingRefunds}</strong> refund${a.pendingRefunds === 1 ? '' : 's'} waiting for a decision</li>`);
    if (a.newInquiries) items.push(`<li><strong>${a.newInquiries}</strong> contact-form message${a.newInquiries === 1 ? '' : 's'} not answered yet</li>`);
    parts.push(h3('Needs your attention'), `<ul style="margin:0;padding-left:20px;font-size:14px;">${items.join('')}</ul>`);
  }

  // Orders
  if (r.orders.length) {
    parts.push(
      h3('Orders'),
      table(
        r.orders.map((o) => [`${escapeHtml(o.orderNumber)}<br><span style="color:${MUTED};font-size:12px;">${escapeHtml(o.customer)} &middot; ${escapeHtml(o.channel)}</span>`, escapeHtml(o.status), money(r, o.total)]),
        ['Order', 'Status', 'Total'],
      ),
      r.ordersOmitted ? `<p style="font-size:12px;color:${MUTED};">and ${r.ordersOmitted} more.</p>` : '',
    );
  }

  if (r.topSellers.length) {
    parts.push(h3('Best sellers'), table(r.topSellers.map((s) => [escapeHtml(s.name), `${s.units} sold`, money(r, s.revenue)])));
  }

  if (r.stock.soldOut.length || r.stock.low.length) {
    const rows = [
      ...r.stock.soldOut.map((s) => [escapeHtml(s.name), escapeHtml(s.sku), 'sold out']),
      ...r.stock.low.map((s) => [escapeHtml(s.name), escapeHtml(s.sku), `${s.onHand} left`]),
    ];
    parts.push(h3('Restock: sizes that sold and are nearly gone'), table(rows));
  }

  // Demand
  const d = r.demand;
  parts.push(
    h3('Interest and lost sales'),
    table([
      ['Carts left behind', `${d.abandonedCarts}`, d.abandonedValue ? money(r, d.abandonedValue) : '-'],
      ['WhatsApp enquiry taps', `${d.whatsappClicks}`, ''],
      ['Campaign link visits', `${d.campaignClicks}`, ''],
      ['Reseller link visits', `${d.referralClicks}`, ''],
    ]),
  );

  if (r.attribution.campaigns.length || r.attribution.referralOrders) {
    const rows = r.attribution.campaigns.map((c) => [escapeHtml(c.name), `${c.orders} order${c.orders === 1 ? '' : 's'}`, money(r, c.revenue)]);
    if (r.attribution.referralOrders) rows.push(['Reseller referrals', `${r.attribution.referralOrders} order${r.attribution.referralOrders === 1 ? '' : 's'}`, money(r, r.attribution.referralRevenue)]);
    parts.push(h3('Where orders came from'), table(rows));
  }

  // Catalogue
  const c = r.catalogue;
  parts.push(
    h3('Catalogue'),
    `<p style="font-size:14px;margin:0;">${c.activeProducts} products live, ${c.feedItems} sizes in the Meta and TikTok feeds.${c.missingPhoto ? ` <strong style="color:${BAD};">${c.missingPhoto} live product${c.missingPhoto === 1 ? ' has' : 's have'} no photo and cannot appear in the feeds.</strong>` : ''}</p>`,
  );

  parts.push(`<p style="font-size:12px;color:${MUTED};margin-top:24px;">Covers ${escapeHtml(r.label)} in Nairobi time. Revenue counts paid, packed, shipped and delivered orders; cancelled and refunded orders are left out. To change who receives this, use the daily report settings in the portal.</p>`);

  return { subject: reportSubject(r), html: parts.join('\n') };
}

/** WhatsApp template parameters must be single-line, so nothing here contains a newline. */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The six values the approved template fills in. Template text (create it in WhatsApp Manager, category Utility):
 *
 *   Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. {{6}} need attention. Full report is in your email.
 */
export function whatsappParams(r: DailyReport): string[] {
  const n = needsActionCount(r);
  return [
    oneLine(r.shopName),
    oneLine(r.label),
    String(r.today.confirmed),
    oneLine(formatMoney(r.today.revenue, r.currency)),
    oneLine(formatChange(r.vsPreviousDay.revenueChange)),
    n === 0 ? 'Nothing' : `${n} item${n === 1 ? '' : 's'}`,
  ];
}

export function whatsappPreview(r: DailyReport, template = 'Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. {{6}} need attention. Full report is in your email.') {
  const p = whatsappParams(r);
  return template.replace(/\{\{(\d)\}\}/g, (_, i) => p[Number(i) - 1] ?? '');
}
