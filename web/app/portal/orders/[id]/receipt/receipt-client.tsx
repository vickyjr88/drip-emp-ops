"use client";

/**
 * A receipt for one order that prints cleanly (or saves as a PDF from the print dialog): what was bought, what it came to, what was paid.
 * A page of its own, without the portal's menu, so what comes out of the printer is the receipt and nothing around it.
 */

import { useEffect, useState } from 'react';
import { TOKEN_KEY, apiRequest, formatMoney } from '../../../accounting/lib';

type Line = { id: string; description: string; quantity: number; unitPrice: string | number; discount: string | number; lineTotal: string | number; variant?: { name: string; product?: { name: string } | null } | null };
type Order = {
  orderNumber: string; placedAt: string; status: string; channel: string;
  subtotal: string | number; discount: string | number; shipping: string | number; total: string | number; amountPaid: string | number; balance: number;
  customerName?: string | null; customerPhone?: string | null; shippingAddress?: string | null;
  store: { name: string; code: string };
  customer?: { firstName: string; lastName: string; phone?: string | null } | null;
  lines: Line[];
  payments: Array<{ id: string; amount: string | number; method: string; reference?: string | null; receivedAt: string }>;
};

const METHOD: Record<string, string> = { MPESA: 'M-Pesa', CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer' };

export default function ReceiptClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) { setError('Sign in to the portal first.'); return; }
    apiRequest<Order>(`/orders/${orderId}`, { method: 'GET' }, token).then(setOrder).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the order.'));
  }, [orderId]);

  if (error) return <main className="receipt-page"><p className="receipt-error">{error}</p></main>;
  if (!order) return <main className="receipt-page"><p>Loading…</p></main>;

  const who = order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : order.customerName || 'Walk-in';
  const phone = order.customer?.phone || order.customerPhone;
  const discount = Number(order.discount);
  const shipping = Number(order.shipping);

  return (
    <main className="receipt-page">
      <div className="receipt-actions">
        <button type="button" className="portal-primary-btn" onClick={() => window.print()}>Print or save as PDF</button>
        <button type="button" className="portal-ghost-btn" onClick={() => window.history.back()}>Back</button>
      </div>

      <article className="receipt-sheet">
        <header>
          <h1>Drip Emporium</h1>
          <p>{order.store.name}</p>
        </header>

        <dl className="receipt-meta">
          <div><dt>Receipt</dt><dd>{order.orderNumber}</dd></div>
          <div><dt>Date</dt><dd>{new Date(order.placedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' })}</dd></div>
          <div><dt>Customer</dt><dd>{who}{phone ? ` · ${phone}` : ''}</dd></div>
          {order.shippingAddress ? <div><dt>Deliver to</dt><dd>{order.shippingAddress}</dd></div> : null}
        </dl>

        <table className="receipt-lines">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            {order.lines.map((line) => {
              const product = line.variant?.product?.name ?? line.description;
              const size = line.variant?.name && line.variant.name !== product ? line.variant.name : '';
              return (
                <tr key={line.id}>
                  <td>{product}{size ? <small> · {size}</small> : null}</td>
                  <td>{line.quantity}</td>
                  <td>{formatMoney(line.unitPrice)}</td>
                  <td>{formatMoney(line.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <dl className="receipt-totals">
          {discount > 0 ? <div><dt>Discount</dt><dd>-{formatMoney(discount)}</dd></div> : null}
          {shipping > 0 ? <div><dt>Delivery</dt><dd>{formatMoney(shipping)}</dd></div> : null}
          <div className="is-total"><dt>Total</dt><dd>{formatMoney(order.total)}</dd></div>
          {order.payments.map((payment) => (
            <div key={payment.id}><dt>Paid · {METHOD[payment.method] ?? payment.method}{payment.reference ? ` (${payment.reference})` : ''}</dt><dd>{formatMoney(payment.amount)}</dd></div>
          ))}
          <div className="is-total"><dt>{order.balance > 0 ? 'Balance to pay' : 'Balance'}</dt><dd>{order.balance > 0 ? formatMoney(order.balance) : 'Settled'}</dd></div>
        </dl>

        <footer>Thank you for shopping with us.</footer>
      </article>
    </main>
  );
}
