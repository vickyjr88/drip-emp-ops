"use client";

/**
 * "Follow up on WhatsApp": opens the customer's chat with a message already written, listing what was in the cart or order
 * with a link to each product. Nothing is sent from here. The message opens in WhatsApp for staff to read, change if they
 * like, and send themselves.
 *
 * The message itself is built on the server (backend/src/common/follow-up.ts), which also knows the storefront's address,
 * so the links are the real ones and the wording is the same wherever the button appears.
 */

import { ReactNode } from 'react';
import { apiRequest } from '../accounting/lib';

export type FollowUp = { phone: string; message: string; url: string };

export function FollowUpButton({ followUp, onOpened, children }: { followUp: FollowUp | null | undefined; onOpened?: () => void; children?: ReactNode }) {
  if (!followUp) return null;
  return (
    <a
      className="portal-inline-btn"
      href={followUp.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onOpened?.()}
      title="Opens WhatsApp with the message ready. You press send."
    >
      {children ?? 'Follow up on WhatsApp'}
    </a>
  );
}

/** What will be sent, shown before it is: staff can see exactly what the customer is about to read. */
export function FollowUpPreview({ followUp }: { followUp: FollowUp | null | undefined }) {
  if (!followUp) return null;
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="portal-muted" style={{ cursor: 'pointer' }}>See the message</summary>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0 0', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{followUp.message}</pre>
      <p className="portal-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>To {followUp.phone}. You can change it in WhatsApp before sending.</p>
    </details>
  );
}

/** Marks a lead contacted once its follow-up is opened, so the list shows who has already been chased. A failure is not worth interrupting the chat for. */
export async function markLeadContacted(token: string, leadId: string): Promise<boolean> {
  try {
    await apiRequest(`/cart-leads/${leadId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'CONTACTED' }) }, token);
    return true;
  } catch {
    return false;
  }
}
