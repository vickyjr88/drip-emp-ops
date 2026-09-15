"use client";

/**
 * One cart lead, in full -- the detail view the "Cart Leads" nav entry and
 * every list row link into, distinct from an order's own detail page. A
 * lead is not yet a sale: this exists to give staff everything they need to
 * follow up (contact info, every item with its own picture, where it came
 * from) without the orders list's filters and pager in the way.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { ImageLightbox } from '../../components/image-lightbox';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';

type CartLeadLine = {
  variantId: string; sku: string; name: string; size: string; quantity: number; priceKes: number;
  imageUrl: string | null;
};

type CartLead = {
  id: string;
  source: 'WHATSAPP_ORDER' | 'ABANDONED_CART';
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'EXPIRED';
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  message?: string | null;
  lines: CartLeadLine[];
  subtotal: string | number;
  shipping: string | number;
  total: string | number;
  lastActivityAt: string;
  createdAt: string;
  reminderSentAt?: string | null;
  customer?: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null } | null;
  order?: { id: string; orderNumber: string } | null;
};

function statusLabel(status: CartLead['status']) {
  switch (status) {
    case 'NEW': return 'New';
    case 'CONTACTED': return 'Contacted';
    case 'CONVERTED': return 'Converted';
    case 'EXPIRED': return 'Dismissed';
    default: return status;
  }
}

function statusChipClass(status: CartLead['status']) {
  if (status === 'CONVERTED') return 'portal-chip is-success';
  if (status === 'EXPIRED') return 'portal-chip is-muted';
  return 'portal-chip is-active';
}

export default function CartLeadDetailClient({ leadId }: { leadId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [lead, setLead] = useState<CartLead | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const [nextProfile, nextLead] = await Promise.all([
        loadProfile(authToken),
        apiRequest<CartLead>(`/cart-leads/${leadId}`, { method: 'GET' }, authToken),
      ]);
      setProfile(nextProfile);
      setLead(nextLead);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [leadId, setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  async function onMarkContacted() {
    if (!token || !lead) return;
    try {
      const updated = await apiRequest<CartLead>(`/cart-leads/${lead.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CONTACTED' }),
      }, token);
      setLead((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setFeedback('Marked as contacted.');
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onDismiss() {
    if (!token || !lead) return;
    try {
      const updated = await apiRequest<CartLead>(`/cart-leads/${lead.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'EXPIRED' }),
      }, token);
      setLead((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setFeedback('Lead dismissed.');
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading cart lead...</article>
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

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="cartLeads"
            pageTitle={lead ? (lead.customerName || lead.customerPhone || lead.customerEmail || 'Cart Lead') : 'Cart Lead'}
            pageSubtitle={lead ? `${lead.source === 'WHATSAPP_ORDER' ? 'WhatsApp order' : 'Abandoned cart'} · Last active ${formatDateTime(lead.lastActivityAt)}` : undefined}
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-feedback">{feedback}</article> : null}

            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/cart-leads" className="portal-ghost-btn">
                ← Back to Cart Leads
              </Link>
            </div>

            {!lead ? (
              <article className="portal-card">Cart lead not found.</article>
            ) : (
              <>
                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <div>
                      <h2 style={{ margin: 0 }}>{lead.customerName || 'No name given'}</h2>
                      <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                        {lead.customerPhone || 'No phone'} · {lead.customerEmail || 'No email'}
                      </p>
                    </div>
                    <span className={statusChipClass(lead.status)}>{statusLabel(lead.status)}</span>
                  </div>

                  <dl className="portal-detail-grid">
                    <div>
                      <dt>Source</dt>
                      <dd>{lead.source === 'WHATSAPP_ORDER' ? 'WhatsApp order' : 'Abandoned cart'}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDateTime(lead.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Last activity</dt>
                      <dd>{formatDateTime(lead.lastActivityAt)}</dd>
                    </div>
                    {lead.shippingAddress ? (
                      <div>
                        <dt>Delivery address</dt>
                        <dd>{lead.shippingAddress}</dd>
                      </div>
                    ) : null}
                    {lead.reminderSentAt ? (
                      <div>
                        <dt>Reminder sent</dt>
                        <dd>{formatDateTime(lead.reminderSentAt)}</dd>
                      </div>
                    ) : null}
                    {lead.customer ? (
                      <div>
                        <dt>Matched customer</dt>
                        <dd>
                          <Link href={`/portal/customers/${lead.customer.id}`}>
                            {lead.customer.firstName} {lead.customer.lastName}
                          </Link>
                        </dd>
                      </div>
                    ) : null}
                    {lead.order ? (
                      <div>
                        <dt>Converted to</dt>
                        <dd>
                          <Link href={`/portal/orders/${lead.order.id}`}>Order {lead.order.orderNumber}</Link>
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {lead.message ? (
                    <>
                      <h3 style={{ marginBottom: 4 }}>Message</h3>
                      <p className="portal-muted" style={{ whiteSpace: 'pre-wrap' }}>{lead.message}</p>
                    </>
                  ) : null}

                  {lead.status === 'NEW' || lead.status === 'CONTACTED' ? (
                    <div className="portal-action-row" style={{ marginTop: 16 }}>
                      {lead.status === 'NEW' ? (
                        <button type="button" className="portal-inline-btn" onClick={() => void onMarkContacted()}>
                          Mark Contacted
                        </button>
                      ) : null}
                      <button type="button" className="portal-inline-btn" onClick={() => void onDismiss()}>
                        Dismiss
                      </button>
                      <Link href="/portal/orders" className="portal-inline-btn">
                        Start Order From Cart
                      </Link>
                    </div>
                  ) : null}
                </article>

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>Cart contents</h2>
                  <div className="portal-table-wrap">
                    <table className="portal-data-table is-doc">
                      <thead>
                        <tr>
                          <th />
                          <th>Item</th><th>Size</th><th>Qty</th><th>Price</th><th>Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lead.lines.map((line, index) => (
                          <tr key={`${line.variantId}-${index}`}>
                            <td>
                              {line.imageUrl ? (
                                <div
                                  className="portal-list-thumb is-clickable"
                                  onClick={() => setLightboxImage({ src: line.imageUrl as string, alt: line.name })}
                                >
                                  <img src={line.imageUrl} alt="" loading="lazy" />
                                </div>
                              ) : (
                                <div className="portal-list-thumb is-empty" aria-hidden="true">
                                  <span>{(line.name || '?').trim().charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                            </td>
                            <td>
                              {line.name}
                              <div className="portal-muted">{line.sku}</div>
                            </td>
                            <td>{line.size}</td>
                            <td>{line.quantity}</td>
                            <td>{formatMoney(line.priceKes)}</td>
                            <td>{formatMoney(line.priceKes * line.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'right' }}>Subtotal</td>
                          <td>{formatMoney(lead.subtotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'right' }}>Shipping</td>
                          <td>{formatMoney(lead.shipping)}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'right' }}><strong>Total</strong></td>
                          <td><strong>{formatMoney(lead.total)}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </article>
              </>
            )}
          </PortalShell>
        </section>
      </main>

      {lightboxImage ? (
        <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
      ) : null}
    </EliteLayout>
  );
}
