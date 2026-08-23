"use client";

/**
 * Where Paystack sends the customer back to.
 *
 * The page asks the server to verify the reference rather than trusting the
 * URL it was reached by — landing here proves only that a browser followed a
 * link. The order is shown as paid only once the API confirms it against
 * Paystack.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { formatKes } from '../../lib/shop';
import { useEnquiryContact } from '../../lib/use-enquiry-contact';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

type OrderView = {
  orderNumber: string;
  status: string;
  total: number;
  amountPaid: number;
  customerName?: string | null;
  shippingAddress?: string | null;
  store?: { name: string; location?: string | null } | null;
  lines: Array<{ description: string; quantity: number; lineTotal: number }>;
};

export function CompleteClient() {
  const params = useSearchParams();
  const enquiry = useEnquiryContact();
  const reference = params.get('ref') || params.get('reference') || '';

  const [order, setOrder] = useState<OrderView | null>(null);
  const [state, setState] = useState<'checking' | 'paid' | 'unpaid' | 'missing'>('checking');

  useEffect(() => {
    if (!reference) { setState('missing'); return; }
    let cancelled = false;

    async function run() {
      try {
        // Verify first: this is what actually settles the order if the webhook
        // has not landed yet.
        const verify = await fetch(`${API}/checkout/verify?reference=${encodeURIComponent(reference)}`, {
          cache: 'no-store',
        }).then((response) => response.json());

        const view = await fetch(`${API}/checkout/orders/${encodeURIComponent(reference)}`, {
          cache: 'no-store',
        }).then((response) => response.json());

        if (cancelled) return;
        if (!view?.orderNumber) { setState('missing'); return; }
        setOrder(view);
        setState(verify?.paid || view.status === 'PAID' ? 'paid' : 'unpaid');
      } catch {
        if (!cancelled) setState('missing');
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [reference]);

  return (
    <EliteLayout active="shop">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-complete">
          {state === 'checking' ? (
            <div className="de-complete-card">
              <h1>Checking your payment…</h1>
              <p>One moment. Do not close this page.</p>
            </div>
          ) : null}

          {state === 'missing' ? (
            <div className="de-complete-card">
              <h1>We could not find that order</h1>
              <p>
                If you were charged, nothing is lost — send us the reference and we will sort it out.
              </p>
              <div className="de-complete-actions">
                <a className="lp-button de-whatsapp"
                   href={enquiry.whatsappHref(`Hello, I paid but cannot find my order. Reference: ${reference || 'unknown'}`)}
                   target="_blank" rel="noreferrer">
                  Message us on WhatsApp
                </a>
                <Link className="lp-button lp-button-ghost" href="/shop">Back to the shop</Link>
              </div>
            </div>
          ) : null}

          {order && state === 'paid' ? (
            <div className="de-complete-card is-paid">
              <p className="de-complete-flag">Payment received</p>
              <h1>Thank you{order.customerName ? `, ${order.customerName.split(' ')[0]}` : ''}</h1>
              <p>
                Order <strong>{order.orderNumber}</strong> is paid in full. We will message you on
                WhatsApp when it is ready.
              </p>

              <ul className="de-complete-lines">
                {order.lines.map((line, index) => (
                  <li key={index}>
                    <span>{line.quantity} × {line.description}</span>
                    <em>{formatKes(line.lineTotal)}</em>
                  </li>
                ))}
                <li className="is-total">
                  <span>Total paid</span>
                  <em>{formatKes(order.amountPaid)}</em>
                </li>
              </ul>

              <p className="de-complete-where">
                {order.shippingAddress
                  ? `Delivering to ${order.shippingAddress}.`
                  : `Collect at ${order.store?.name || 'our shop'}${order.store?.location ? `, ${order.store.location}` : ''}. Open 08:00 to 20:00.`}
              </p>

              {/* What was paid covers the goods only. Saying so here, on the
                  page shown the moment the payment lands, is the difference
                  between an expected call and an unexpected charge. */}
              {order.shippingAddress ? (
                <p className="de-complete-where">
                  Delivery is not included in this payment. We will contact you to arrange
                  it and confirm the cost separately.
                </p>
              ) : null}

              <div className="de-complete-actions">
                <Link className="lp-button lp-button-primary" href="/shop">Keep shopping</Link>
                <a className="lp-button de-whatsapp"
                   href={enquiry.whatsappHref(`Hello, about order ${order.orderNumber}…`)}
                   target="_blank" rel="noreferrer">
                  Ask about this order
                </a>
              </div>
            </div>
          ) : null}

          {order && state === 'unpaid' ? (
            <div className="de-complete-card">
              <h1>Payment not completed</h1>
              <p>
                Order <strong>{order.orderNumber}</strong> is held for you at{' '}
                {formatKes(order.total)}, but the payment did not go through. The shoes are set
                aside — message us and we will send a fresh payment link or hold them for
                collection.
              </p>
              <div className="de-complete-actions">
                <a className="lp-button de-whatsapp"
                   href={enquiry.whatsappHref(`Hello, I would like to complete payment for order ${order.orderNumber}.`)}
                   target="_blank" rel="noreferrer">
                  Complete on WhatsApp
                </a>
                <Link className="lp-button lp-button-ghost" href="/shop">Back to the shop</Link>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </EliteLayout>
  );
}
