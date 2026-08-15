"use client";

/**
 * Cart and checkout on one page.
 *
 * A separate checkout step exists to stop people changing their mind, which is
 * not a problem worth solving for a shop this size. Everything a buyer needs
 * to decide — what is in the basket, what delivery costs, what they will pay —
 * is visible while they fill the form.
 *
 * The account password is one optional field rather than a step in front of
 * the purchase. Requiring signup to buy is the most reliable way to lose a
 * sale.
 */

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';
import { useCart } from '../lib/cart';
import { useCustomerAuth } from '../lib/customer-auth';
import { formatKes } from '../lib/shop';
import { useEnquiryContact } from '../lib/use-enquiry-contact';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const FREE_DELIVERY_OVER = 15000;
const DELIVERY_FEE = 500;

export function CartClient() {
  const cart = useCart();
  const enquiry = useEnquiryContact();
  const auth = useCustomerAuth();

  const [online, setOnline] = useState<boolean | null>(null);
  const [deliver, setDeliver] = useState(false);
  const [wantAccount, setWantAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', shippingAddress: '', password: '',
  });
  const formRef = useRef<HTMLFormElement>(null);

  // Prefills from the signed-in customer so a returning buyer does not retype
  // what we already hold. Only fills blanks, so anything typed already wins.
  useEffect(() => {
    if (!auth.customer) return;
    setForm((prev) => ({
      ...prev,
      firstName: prev.firstName || auth.customer!.firstName,
      lastName: prev.lastName || auth.customer!.lastName,
      email: prev.email || auth.customer!.email,
      phone: prev.phone || auth.customer!.phone,
    }));
  }, [auth.customer]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${API}/checkout/config`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setOnline(Boolean(data?.online)); })
      .catch(() => { if (!cancelled) setOnline(false); });
    return () => { cancelled = true; };
  }, []);

  const shipping = deliver ? (cart.subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE) : 0;
  const total = cart.subtotal + shipping;

  /**
   * The order as a message someone can read on a phone.
   *
   * Carries everything the form collected -- who, how to reach them, and where
   * it is going -- so the shop is not left asking for details the buyer has
   * already typed. The password is deliberately never included: it is a
   * credential, and WhatsApp messages get forwarded and backed up.
   */
  function buildWhatsappMessage() {
    const lines = ['Hello Drip Emporium, I would like to order:'];
    for (const line of cart.lines) {
      lines.push(`- ${line.quantity} x ${line.name} (${line.size}) - ${formatKes(line.priceKes * line.quantity)}`);
    }
    lines.push('');
    lines.push(`Subtotal: ${formatKes(cart.subtotal)}`);
    lines.push(`Delivery: ${deliver ? (shipping === 0 ? 'Free' : formatKes(shipping)) : 'Collection at shop'}`);
    lines.push(`Total: ${formatKes(total)}`);
    lines.push('');

    const name = `${form.firstName} ${form.lastName}`.trim();
    if (name) lines.push(`Name: ${name}`);
    if (form.email.trim()) lines.push(`Email: ${form.email.trim()}`);
    if (form.phone.trim()) lines.push(`Phone: ${form.phone.trim()}`);
    if (deliver && form.shippingAddress.trim()) {
      lines.push(`Deliver to: ${form.shippingAddress.trim()}`);
    }
    if (wantAccount) lines.push('Please set up my account for order tracking.');

    return lines.join('\n');
  }

  /**
   * The WhatsApp route, which now does the same work as the card route minus
   * the payment.
   *
   * It used to be a bare link carrying only the item names, so a buyer who had
   * filled in the whole form still arrived in the chat as a stranger and had
   * to repeat themselves. Now it validates the same fields, creates the
   * account if one was asked for, and hands over the full order.
   */
  async function onWhatsapp() {
    setError(null);

    // Uses the form's own validity so the required-field messages are the
    // browser's, in the same place, as for the card path.
    if (formRef.current && !formRef.current.reportValidity()) return;

    setSubmitting(true);
    try {
      if (wantAccount && form.password) {
        const response = await fetch(`${API}/checkout/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            phone: form.phone,
            password: form.password,
          }),
        });
        const data = await response.json();
        // A rejected signup must not swallow the order. The buyer is told, and
        // the message still goes out -- the sale matters more than the account.
        if (!response.ok) {
          setError(`${data?.message || 'Could not create your account.'} Your order details have still been sent.`);
        }
      }
      window.open(enquiry.whatsappHref(buildWhatsappMessage()), '_blank', 'noopener');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          shippingAddress: deliver ? form.shippingAddress : undefined,
          password: wantAccount && form.password ? form.password : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Could not start checkout.');

      // The cart is cleared on the way out: the order exists server-side now,
      // and coming back to a full basket after paying would invite a double
      // purchase.
      cart.clear();
      window.location.href = data.authorizationUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start checkout.');
      setSubmitting(false);
    }
  }

  // The cart lives in localStorage, which the server cannot see, so this page
  // is prerendered without knowing whether it is empty. Holding the heading
  // alone until the cart has loaded avoids showing an arriving visitor a
  // checkout form for one frame and then yanking it away -- or, worse, the
  // empty state to someone whose basket is full.
  if (!cart.ready || cart.lines.length === 0) {
    return (
      <EliteLayout active="shop">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-shop-head">
            <h1>Your cart</h1>
          </section>
          <section className="lp-container">
            {cart.ready ? (
              <div className="de-empty">
                <p>Nothing in your cart yet.</p>
                <Link href="/shop" className="lp-button lp-button-primary">Shop Shoes</Link>
              </div>
            ) : null}
          </section>
        </main>
      </EliteLayout>
    );
  }

  return (
    <EliteLayout active="shop">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <h1>Your cart</h1>
          <p>{cart.count} item{cart.count === 1 ? '' : 's'}</p>
        </section>

        <section className="lp-container de-checkout">
          <div className="de-cart-lines">
            {cart.lines.map((line) => (
              <article key={line.variantId} className="de-cart-line">
                <Link href={`/shop/${line.productSlug}`} className="de-cart-media">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt="" />
                  ) : (
                    <span aria-hidden="true">{line.name.charAt(0)}</span>
                  )}
                </Link>
                <div className="de-cart-detail">
                  <h2><Link href={`/shop/${line.productSlug}`}>{line.name}</Link></h2>
                  <p className="de-cart-meta">{line.size} · {line.sku}</p>
                  <p className="de-cart-unit">{formatKes(line.priceKes)} each</p>
                </div>
                <div className="de-cart-qty">
                  <label>
                    <span className="lp-visually-hidden">Quantity for {line.name}</span>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) => cart.setQuantity(line.variantId, Number(event.target.value))}
                    />
                  </label>
                  <button type="button" onClick={() => cart.remove(line.variantId)}>Remove</button>
                </div>
                <p className="de-cart-total">{formatKes(line.priceKes * line.quantity)}</p>
              </article>
            ))}
          </div>

          <aside className="de-checkout-panel">
            <h2>Checkout</h2>

            <dl className="de-summary">
              <div><dt>Subtotal</dt><dd>{formatKes(cart.subtotal)}</dd></div>
              <div>
                <dt>Delivery</dt>
                <dd>{deliver ? (shipping === 0 ? 'Free' : formatKes(shipping)) : 'Collection'}</dd>
              </div>
              <div className="is-total"><dt>Total</dt><dd>{formatKes(total)}</dd></div>
            </dl>

            {deliver && shipping > 0 ? (
              <p className="de-summary-note">
                Free delivery on orders over {formatKes(FREE_DELIVERY_OVER)} — add{' '}
                {formatKes(FREE_DELIVERY_OVER - cart.subtotal)} more.
              </p>
            ) : null}

            {/* Only offered to signed-out visitors, and never as a barrier:
                the form below works either way. */}
            {auth.ready && !auth.customer ? (
              <p className="de-cart-signin">
                Bought from us before?{' '}
                <Link href="/account/login?next=/cart">Sign in</Link> to fill this in automatically.
              </p>
            ) : null}

            {error ? <p className="de-checkout-error">{error}</p> : null}

            <form className="de-checkout-form" ref={formRef} onSubmit={onSubmit}>
              <label>
                <span>First name</span>
                <input value={form.firstName} required autoComplete="given-name"
                  onChange={(event) => setForm((p) => ({ ...p, firstName: event.target.value }))} />
              </label>
              <label>
                <span>Last name</span>
                <input value={form.lastName} required autoComplete="family-name"
                  onChange={(event) => setForm((p) => ({ ...p, lastName: event.target.value }))} />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} required autoComplete="email"
                  onChange={(event) => setForm((p) => ({ ...p, email: event.target.value }))} />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} required placeholder="+254…" autoComplete="tel"
                  onChange={(event) => setForm((p) => ({ ...p, phone: event.target.value }))} />
              </label>

              <label className="de-check">
                <input type="checkbox" checked={deliver}
                  onChange={(event) => setDeliver(event.target.checked)} />
                <span>Deliver to me (otherwise collect at the shop)</span>
              </label>

              {deliver ? (
                <label>
                  <span>Delivery address</span>
                  <textarea rows={2} value={form.shippingAddress} required
                    placeholder="Estate, street, building, and a landmark"
                    onChange={(event) => setForm((p) => ({ ...p, shippingAddress: event.target.value }))} />
                </label>
              ) : null}

              {auth.customer ? null : (
                <label className="de-check">
                  <input type="checkbox" checked={wantAccount}
                    onChange={(event) => setWantAccount(event.target.checked)} />
                  <span>Create an account to track my orders</span>
                </label>
              )}

              {wantAccount && !auth.customer ? (
                <label>
                  <span>Password</span>
                  <input type="password" minLength={8} value={form.password} required
                    autoComplete="new-password" placeholder="At least 8 characters"
                    onChange={(event) => setForm((p) => ({ ...p, password: event.target.value }))} />
                </label>
              ) : null}

              {online === false ? (
                <div className="de-offline">
                  <p>Card payment is not available right now. Send this order on WhatsApp and we will hold it for you.</p>
                </div>
              ) : (
                <button type="submit" className="lp-button lp-button-primary" disabled={submitting || online === null}>
                  {submitting ? 'Taking you to payment…' : `Pay ${formatKes(total)}`}
                </button>
              )}

              <button
                type="button"
                className="lp-button de-whatsapp"
                onClick={onWhatsapp}
                disabled={submitting}
              >
                {online === false ? 'Send order on WhatsApp' : 'Order on WhatsApp instead'}
              </button>

              {/* Promising Paystack while the card button is hidden would be
                  a lie the buyer can see through. */}
              <p className="de-checkout-note">
                {online === false
                  ? 'We will confirm your order and payment on WhatsApp. '
                  : 'Paid securely by card or M-Pesa through Paystack. '}
                Collect at Dubai Merchants Mall shop F53 or Palms Mall shop BF75, open 08:00 to
                20:00.
              </p>
            </form>
          </aside>
        </section>
      </main>
    </EliteLayout>
  );
}
