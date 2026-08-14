function formatMoney(amount: number | string, currency = 'KES') {
  const value = Number(amount || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2121; margin: 0; padding: 0; font-size: 13px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1c1c; padding-bottom: 16px; margin-bottom: 24px; }
  .doc-header h1 { font-size: 22px; margin: 0 0 4px; }
  .doc-header .doc-number { color: #5b6161; font-size: 13px; }
  .doc-meta { text-align: right; font-size: 12px; color: #5b6161; }
  .doc-meta strong { color: #1f2121; font-size: 13px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 24px; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #8a908f; margin: 0 0 6px; }
  .party p { margin: 0; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #5b6161; border-bottom: 1px solid #d8dcdb; padding: 8px 6px; }
  td { padding: 10px 6px; border-bottom: 1px solid #eef0ef; font-size: 13px; }
  td.amount, th.amount { text-align: right; }
  tfoot td { border-bottom: none; padding-top: 12px; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .row.grand { border-top: 2px solid #1a1c1c; font-weight: 700; font-size: 15px; padding-top: 10px; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #eef0ef; color: #1f2121; }
  .footer-note { margin-top: 32px; font-size: 11px; color: #8a908f; }
  .section-title { font-size: 13px; font-weight: 700; margin: 28px 0 10px; padding-top: 16px; border-top: 1px solid #eef0ef; }
  .terms-placeholder { font-size: 12px; color: #8a908f; border: 1px dashed #d8dcdb; border-radius: 4px; padding: 14px; line-height: 1.6; }
  .signature-row { display: flex; justify-content: space-between; margin-top: 48px; gap: 32px; }
  .signature-block { flex: 1; }
  .signature-line { border-top: 1px solid #1a1c1c; margin-top: 48px; padding-top: 6px; font-size: 11px; color: #5b6161; }
`;

export function invoicePdfTemplate(params: {
  invoiceNumber: string;
  issuedAt: Date | string;
  dueDate: Date | string;
  status: string;
  currency: string;
  customerName: string;
  customerEmail?: string | null;
  lines: { description: string; amount: number | string; taxAmount?: number | string }[];
  amount: number | string;
  paidAmount: number;
}) {
  const totalTax = params.lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0);
  const netAmount = Number(params.amount) - totalTax;
  const balance = Number(params.amount) - params.paidAmount;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <h1>Invoice</h1>
        <div class="doc-number">${escapeHtml(params.invoiceNumber)}</div>
      </div>
      <div class="doc-meta">
        <div>Issued <strong>${formatDate(params.issuedAt)}</strong></div>
        <div>Due <strong>${formatDate(params.dueDate)}</strong></div>
        <div style="margin-top:8px"><span class="status-badge">${escapeHtml(params.status)}</span></div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Billed To</h3>
        <p>${escapeHtml(params.customerName)}</p>
        ${params.customerEmail ? `<p>${escapeHtml(params.customerEmail)}</p>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        ${params.lines
          .map(
            (line) => `<tr><td>${escapeHtml(line.description)}</td><td class="amount">${formatMoney(line.amount, params.currency)}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatMoney(netAmount, params.currency)}</span></div>
      ${totalTax > 0 ? `<div class="row"><span>Tax</span><span>${formatMoney(totalTax, params.currency)}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span>${formatMoney(params.amount, params.currency)}</span></div>
      ${params.paidAmount > 0 ? `<div class="row"><span>Paid</span><span>${formatMoney(params.paidAmount, params.currency)}</span></div>
      <div class="row grand"><span>Balance Due</span><span>${formatMoney(balance, params.currency)}</span></div>` : ''}
    </div>
    <div class="footer-note">Generated by Dirrir Realtors. This document is auto-generated and does not require a signature.</div>
  </body></html>`;
}

export function salesContractPdfTemplate(params: {
  contractNumber: string;
  contractStatus: string;
  createdAt: Date | string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  unitLabel: string;
  currency: string;
  totalAgreedPrice: number | string;
  installments: { sequence: number; dueDate: Date | string; amount: number | string; invoiced: boolean }[];
  paid?: number;
  balance?: number;
  paidPercent?: number;
}) {
  const scheduledTotal = params.installments.reduce((sum, item) => sum + Number(item.amount), 0);
  const hasPaymentSummary = params.paid != null && params.balance != null;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <h1>Sale Agreement</h1>
        <div class="doc-number">Contract ${escapeHtml(params.contractNumber)}</div>
      </div>
      <div class="doc-meta">
        <div>Dated <strong>${formatDate(params.createdAt)}</strong></div>
        <div style="margin-top:8px"><span class="status-badge">${escapeHtml(params.contractStatus)}</span></div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Purchaser</h3>
        <p>${escapeHtml(params.customerName)}</p>
        ${params.customerEmail ? `<p>${escapeHtml(params.customerEmail)}</p>` : ''}
        ${params.customerPhone ? `<p>${escapeHtml(params.customerPhone)}</p>` : ''}
      </div>
      <div class="party">
        <h3>Unit</h3>
        <p>${escapeHtml(params.unitLabel)}</p>
      </div>
      <div class="party">
        <h3>Total Agreed Price</h3>
        <p>${formatMoney(params.totalAgreedPrice, params.currency)}</p>
      </div>
      ${
        hasPaymentSummary
          ? `<div class="party">
              <h3>Paid to Date</h3>
              <p>${formatMoney(params.paid!, params.currency)} (${(params.paidPercent ?? 0).toFixed(1)}%)</p>
            </div>`
          : ''
      }
    </div>

    <div class="section-title">Payment Schedule</div>
    <table>
      <thead><tr><th>#</th><th>Due Date</th><th>Status</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        ${
          params.installments.length > 0
            ? params.installments
                .map(
                  (item) => `<tr>
                    <td>${item.sequence}</td>
                    <td>${formatDate(item.dueDate)}</td>
                    <td>${item.invoiced ? '<span class="status-badge">Invoiced</span>' : ''}</td>
                    <td class="amount">${formatMoney(item.amount, params.currency)}</td>
                  </tr>`,
                )
                .join('')
            : `<tr><td colspan="4" style="color:#8a908f">No payment schedule has been configured for this contract yet.</td></tr>`
        }
      </tbody>
    </table>
    <div class="totals">
      <div class="row grand"><span>${params.installments.length > 0 ? 'Scheduled Total' : 'Total Agreed Price'}</span><span>${formatMoney(params.installments.length > 0 ? scheduledTotal : params.totalAgreedPrice, params.currency)}</span></div>
      ${
        hasPaymentSummary
          ? `<div class="row"><span>Paid to Date</span><span>${formatMoney(params.paid!, params.currency)}</span></div>
             <div class="row grand"><span>Balance Due</span><span>${formatMoney(params.balance!, params.currency)}</span></div>`
          : ''
      }
    </div>

    <div class="section-title">Terms &amp; Conditions</div>
    <div class="terms-placeholder">
      Standard terms and conditions for this sale agreement have not yet been configured in the system. This
      section is reserved for the applicable legal clauses (title transfer, default and remedies, cancellation,
      dispute resolution, and any project-specific covenants) prior to execution.
    </div>

    <div class="signature-row">
      <div class="signature-block">
        <div class="signature-line">Purchaser Signature &amp; Date</div>
      </div>
      <div class="signature-block">
        <div class="signature-line">Authorized Signatory &amp; Date</div>
      </div>
    </div>

    <div class="footer-note">Generated by Dirrir Realtors. This is a system-generated summary of the sale agreement and payment schedule and is not a substitute for the fully executed legal contract.</div>
  </body></html>`;
}

export function receiptPdfTemplate(params: {
  receiptNumber: string;
  receivedAt: Date | string;
  amount: number | string;
  currency: string;
  payerName: string;
  payerEmail?: string | null;
  paymentMethod: string;
  transactionReference?: string | null;
  description: string;
  balance?: number | null;
}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <h1>Receipt</h1>
        <div class="doc-number">${escapeHtml(params.receiptNumber)}</div>
      </div>
      <div class="doc-meta">
        <div>Received <strong>${formatDate(params.receivedAt)}</strong></div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Received From</h3>
        <p>${escapeHtml(params.payerName)}</p>
        ${params.payerEmail ? `<p>${escapeHtml(params.payerEmail)}</p>` : ''}
      </div>
      <div class="party">
        <h3>Payment Method</h3>
        <p>${escapeHtml(params.paymentMethod.replaceAll('_', ' '))}</p>
        ${params.transactionReference ? `<p>Ref: ${escapeHtml(params.transactionReference)}</p>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        <tr><td>${escapeHtml(params.description)}</td><td class="amount">${formatMoney(params.amount, params.currency)}</td></tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="row grand"><span>Amount Received</span><span>${formatMoney(params.amount, params.currency)}</span></div>
      ${params.balance != null ? `<div class="row"><span>Remaining Balance</span><span>${formatMoney(params.balance, params.currency)}</span></div>` : ''}
    </div>
    <div class="footer-note">Generated by Dirrir Realtors. This document is auto-generated and does not require a signature.</div>
  </body></html>`;
}

export function paymentSchedulePdfTemplate(params: {
  contractNumber: string;
  customerName: string;
  unitLabel: string;
  currency: string;
  totalAgreedPrice: number | string;
  generatedAt: Date | string;
  installments: { sequence: number; dueDate: Date | string; amount: number | string; invoiced: boolean }[];
  paid?: number;
  balance?: number;
  paidPercent?: number;
}) {
  const scheduledTotal = params.installments.reduce((sum, item) => sum + Number(item.amount), 0);
  const hasPaymentSummary = params.paid != null && params.balance != null;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <h1>Payment Schedule</h1>
        <div class="doc-number">Contract ${escapeHtml(params.contractNumber)}</div>
      </div>
      <div class="doc-meta">
        <div>Generated <strong>${formatDate(params.generatedAt)}</strong></div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Customer</h3>
        <p>${escapeHtml(params.customerName)}</p>
      </div>
      <div class="party">
        <h3>Unit</h3>
        <p>${escapeHtml(params.unitLabel)}</p>
      </div>
      <div class="party">
        <h3>Total Agreed Price</h3>
        <p>${formatMoney(params.totalAgreedPrice, params.currency)}</p>
      </div>
      ${
        hasPaymentSummary
          ? `<div class="party">
              <h3>Paid to Date</h3>
              <p>${formatMoney(params.paid!, params.currency)} (${(params.paidPercent ?? 0).toFixed(1)}%)</p>
            </div>`
          : ''
      }
    </div>
    <table>
      <thead><tr><th>#</th><th>Due Date</th><th>Status</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        ${params.installments
          .map(
            (item) => `<tr>
              <td>${item.sequence}</td>
              <td>${formatDate(item.dueDate)}</td>
              <td>${item.invoiced ? '<span class="status-badge">Invoiced</span>' : ''}</td>
              <td class="amount">${formatMoney(item.amount, params.currency)}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="row grand"><span>Scheduled Total</span><span>${formatMoney(scheduledTotal, params.currency)}</span></div>
      ${
        hasPaymentSummary
          ? `<div class="row"><span>Paid to Date</span><span>${formatMoney(params.paid!, params.currency)}</span></div>
             <div class="row grand"><span>Balance Due</span><span>${formatMoney(params.balance!, params.currency)}</span></div>`
          : ''
      }
    </div>
    <div class="footer-note">Generated by Dirrir Realtors. This document is auto-generated and does not require a signature.</div>
  </body></html>`;
}

export function pettyCashVoucherPdfTemplate(params: {
  voucherNumber: string;
  type: 'TOPUP' | 'EXPENSE';
  createdAt: Date | string;
  boxName: string;
  custodian: string;
  currency: string;
  amount: number | string;
  payee?: string | null;
  purpose: string;
  glAccountLabel?: string | null;
  receiptUrl?: string | null;
  status: string;
}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <h1>${params.type === 'TOPUP' ? 'Top-Up Voucher' : 'Expense Voucher'}</h1>
        <div class="doc-number">${escapeHtml(params.voucherNumber)}</div>
      </div>
      <div class="doc-meta">
        <div>Dated <strong>${formatDate(params.createdAt)}</strong></div>
        <div style="margin-top:8px"><span class="status-badge">${escapeHtml(params.status)}</span></div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Petty Cash Box</h3>
        <p>${escapeHtml(params.boxName)}</p>
        <p>Custodian: ${escapeHtml(params.custodian)}</p>
      </div>
      ${
        params.payee
          ? `<div class="party">
              <h3>Payee</h3>
              <p>${escapeHtml(params.payee)}</p>
            </div>`
          : ''
      }
      <div class="party">
        <h3>Amount</h3>
        <p>${formatMoney(params.amount, params.currency)}</p>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        <tr><td>${escapeHtml(params.purpose)}${params.glAccountLabel ? ` <span style="color:#8a908f">(${escapeHtml(params.glAccountLabel)})</span>` : ''}</td><td class="amount">${formatMoney(params.amount, params.currency)}</td></tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="row grand"><span>${params.type === 'TOPUP' ? 'Amount Received' : 'Amount Disbursed'}</span><span>${formatMoney(params.amount, params.currency)}</span></div>
    </div>
    ${
      params.receiptUrl
        ? `<div class="section-title">Supporting Receipt</div>
           <p style="font-size:12px;color:#5b6161">A supporting receipt is attached to this voucher in the system: ${escapeHtml(params.receiptUrl)}</p>`
        : ''
    }
    <div class="signature-row">
      <div class="signature-block">
        <div class="signature-line">Payee / Received By &amp; Date</div>
      </div>
      <div class="signature-block">
        <div class="signature-line">Authorized By &amp; Date</div>
      </div>
    </div>
    <div class="footer-note">Generated by Dirrir Realtors. This document is auto-generated and does not require a signature.</div>
  </body></html>`;
}
