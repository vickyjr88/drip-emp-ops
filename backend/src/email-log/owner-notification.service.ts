import { Injectable, Logger } from '@nestjs/common';
import { EmailSenderService } from './email-sender.service';

const OWNER_EMAIL = 'emporiumdrip@gmail.com';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(amount: number) {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A plain `<dt>/<dd>` line, value escaped since every field here ultimately comes from a public form. */
function row(label: string, value: string) {
  return `<p style="margin:0 0 6px"><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
}

/**
 * Tells the shop owner about the handful of events worth knowing about the
 * moment they happen, rather than only showing up later in a portal list
 * nobody is staring at: a cart someone gave up on, an order that got paid, a
 * new account, a question through the contact form.
 *
 * One inbox, hardcoded rather than configured -- this is the owner's own
 * notification address, not a per-environment setting like the SMTP sender
 * identity is.
 *
 * Every method swallows its own failure. A notification email is a courtesy,
 * not part of the transaction it reports on: an SMTP hiccup must never fail
 * the checkout, the signup or the cart sync that triggered it.
 */
@Injectable()
export class OwnerNotificationService {
  private readonly logger = new Logger(OwnerNotificationService.name);

  constructor(private readonly email: EmailSenderService) {}

  private async safeSend(subject: string, html: string) {
    try {
      const result = await this.email.send({ to: OWNER_EMAIL, subject, html });
      if (!result.delivered) {
        this.logger.warn(`Owner notification "${subject}" not delivered: ${result.error}`);
      }
    } catch (error) {
      this.logger.error(
        `Owner notification "${subject}" threw: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async notifyAbandonedCart(lead: {
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    lines: Array<{ name: string; size: string; quantity: number }>;
    total: number;
  }) {
    const items = lead.lines
      .map((line) => `<li>${escapeHtml(`${line.quantity} x ${line.name} (${line.size})`)}</li>`)
      .join('');

    await this.safeSend(
      'Cart abandoned',
      `<h2>Someone left items in their cart</h2>
      ${row('Name', lead.customerName || 'Not given')}
      ${row('Phone', lead.customerPhone || 'Not given')}
      ${row('Email', lead.customerEmail || 'Not given')}
      ${row('Cart total', money(lead.total))}
      <p style="margin:16px 0 4px"><strong>Items:</strong></p>
      <ul style="margin:0 0 16px">${items}</ul>
      <p style="color:#666">Check the Cart Leads list in the portal Orders page to follow up.</p>`,
    );
  }

  async notifyOrderPaid(order: {
    orderNumber: string;
    channel: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    total: number;
  }) {
    await this.safeSend(
      `Order paid — ${order.orderNumber}`,
      `<h2>${escapeHtml(order.orderNumber)} has been paid</h2>
      ${row('Channel', order.channel.replace('_', ' '))}
      ${row('Customer', order.customerName || 'Walk-in')}
      ${row('Phone', order.customerPhone || 'Not given')}
      ${row('Email', order.customerEmail || 'Not given')}
      ${row('Total', money(order.total))}`,
    );
  }

  async notifySignup(customer: { firstName: string; lastName: string; email: string; phone: string }) {
    await this.safeSend(
      'New customer signup',
      `<h2>New account created</h2>
      ${row('Name', `${customer.firstName} ${customer.lastName}`.trim())}
      ${row('Email', customer.email)}
      ${row('Phone', customer.phone)}`,
    );
  }

  async notifyContactForm(submission: { name: string; email: string; phone?: string | null; message: string }) {
    await this.safeSend(
      `Contact form: ${submission.name}`,
      `<h2>New contact form submission</h2>
      ${row('Name', submission.name)}
      ${row('Email', submission.email)}
      ${row('Phone', submission.phone || 'Not given')}
      <p style="margin:16px 0 4px"><strong>Message:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(submission.message)}</p>`,
    );
  }
}
