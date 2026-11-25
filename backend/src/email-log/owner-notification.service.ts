import { Injectable } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { greetingName } from '../common/follow-up';
import { money } from './email-html.util';

/// Reused beyond owner alerts -- also the destination for the daily
/// operations report -- so it is named for that role, not this file's.
export const OWNER_EMAIL = process.env.OWNER_EMAIL || 'emporiumdrip@gmail.com';

const SHOP = 'Drip Emporium';

/**
 * Tells the shop's people about the events worth knowing about the moment they happen, rather than only showing up later in a portal
 * list nobody is staring at: a cart someone gave up on, a shopper who chose WhatsApp to order, an order placed or paid, a question,
 * a customer's message, a comment, a review, a size running out.
 *
 * Each method only says what happened; AlertsService decides who hears it, by which channel (email, WhatsApp), whether it is switched
 * off, and records what became of it. Where there is a customer to reply to, the alert carries a link that opens their WhatsApp chat
 * with a message ready (nothing is sent from here: a person reads it and presses send) -- the point is a quick follow-up.
 *
 * Every method swallows its own failure (AlertsService.notify never throws): an alert is a courtesy, not part of the transaction it
 * reports on, so an SMTP or WhatsApp hiccup must never fail the checkout, the signup or the cart sync that triggered it.
 */
@Injectable()
export class OwnerNotificationService {
  constructor(private readonly alerts: AlertsService) {}

  async notifyAbandonedCart(lead: {
    id?: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    lines: Array<{ name: string; size: string; quantity: number }>;
    total: number;
  }) {
    await this.alerts.notify({
      kind: 'cart.abandoned',
      subject: 'Cart abandoned',
      heading: 'Someone left items in their cart',
      rows: [
        ['Name', lead.customerName || 'Not given'],
        ['Phone', lead.customerPhone || 'Not given'],
        ['Email', lead.customerEmail || 'Not given'],
        ['Cart total', money(lead.total)],
        ['Items', lead.lines.map((l) => `${l.quantity} x ${l.name} (${l.size})`).join(', ')],
      ],
      followUp: {
        phone: lead.customerPhone,
        message: `Hi ${greetingName(lead.customerName)}, it's ${SHOP}. You left some shoes in your cart. Can I help you finish the order?`,
      },
      portalPath: '/portal/cart-leads',
      dedupeKey: lead.id,
    });
  }

  /** A shopper who sent their cart to the shop on WhatsApp instead of paying on the site: the warmest lead there is. */
  async notifyWhatsAppLead(lead: {
    id?: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    lines: Array<{ name: string; size: string; quantity: number }>;
    total: number;
  }) {
    await this.alerts.notify({
      kind: 'lead.whatsapp',
      subject: 'Shopper chose WhatsApp to order',
      heading: 'Someone is ordering through WhatsApp',
      rows: [
        ['Name', lead.customerName || 'Not given'],
        ['Phone', lead.customerPhone || 'Not given'],
        ['Email', lead.customerEmail || 'Not given'],
        ['Cart total', money(lead.total)],
        ['Items', lead.lines.map((l) => `${l.quantity} x ${l.name} (${l.size})`).join(', ')],
      ],
      followUp: {
        phone: lead.customerPhone,
        message: `Hi ${greetingName(lead.customerName)}, it's ${SHOP}. Thanks for your order request. Where should we deliver, and how would you like to pay?`,
      },
      portalPath: '/portal/cart-leads',
      dedupeKey: lead.id,
    });
  }

  /** A shopper checked out on the website. Not yet paid: it may be, in a minute, or it may be one the shopper walks away from. */
  async notifyOrderPlaced(order: {
    orderNumber: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    total: number;
    items?: string;
  }) {
    await this.alerts.notify({
      kind: 'order.placed',
      subject: `New website order: ${order.orderNumber}`,
      heading: `${order.orderNumber} was placed on the website`,
      rows: [
        ['Customer', order.customerName || 'Not given'],
        ['Phone', order.customerPhone || 'Not given'],
        ['Email', order.customerEmail || 'Not given'],
        ['Total', money(order.total)],
        ['Items', order.items],
        ['Payment', 'Not paid yet'],
      ],
      followUp: {
        phone: order.customerPhone,
        message: `Hi ${greetingName(order.customerName)}, it's ${SHOP}. We have your order ${order.orderNumber}. Is there anything you need to complete the payment?`,
      },
      portalPath: '/portal/orders',
      dedupeKey: order.orderNumber,
    });
  }

  async notifyOrderPaid(order: {
    orderNumber: string;
    channel: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    total: number;
  }) {
    await this.alerts.notify({
      kind: 'order.paid',
      subject: `Order paid — ${order.orderNumber}`,
      heading: `${order.orderNumber} has been paid`,
      rows: [
        ['Channel', order.channel.replace('_', ' ')],
        ['Customer', order.customerName || 'Walk-in'],
        ['Phone', order.customerPhone || 'Not given'],
        ['Email', order.customerEmail || 'Not given'],
        ['Total', money(order.total)],
      ],
      followUp: {
        phone: order.customerPhone,
        message: `Hi ${greetingName(order.customerName)}, it's ${SHOP}. We have received your payment for order ${order.orderNumber}. Thank you! We will arrange delivery.`,
      },
      portalPath: '/portal/orders',
      dedupeKey: order.orderNumber,
    });
  }

  async notifySignup(customer: { firstName: string; lastName: string; email: string; phone: string }) {
    await this.alerts.notify({
      kind: 'customer.signup',
      subject: 'New customer signup',
      heading: 'New account created',
      rows: [['Name', `${customer.firstName} ${customer.lastName}`.trim()], ['Email', customer.email], ['Phone', customer.phone]],
      followUp: { phone: customer.phone, message: `Hi ${greetingName(customer.firstName)}, welcome to ${SHOP}! Tell us if we can help you find anything.` },
      portalPath: '/portal/customers',
      dedupeKey: customer.email.toLowerCase(),
    });
  }

  async notifyContactForm(submission: { id?: string; name: string; email: string; phone?: string | null; message: string }) {
    await this.alerts.notify({
      kind: 'inquiry.contact',
      subject: `Contact form: ${submission.name}`,
      heading: 'New contact form submission',
      rows: [['Name', submission.name], ['Email', submission.email], ['Phone', submission.phone || 'Not given']],
      text: { label: 'Message', value: submission.message },
      followUp: { phone: submission.phone, message: `Hi ${greetingName(submission.name)}, it's ${SHOP}. Thanks for your message. ` },
      portalPath: '/portal/inquiries',
      dedupeKey: submission.id,
    });
  }

  async notifyResellerApplication(application: { id?: string; customerName: string; customerEmail: string; businessName: string; reason: string }) {
    await this.alerts.notify({
      kind: 'reseller.application',
      subject: `Reseller application: ${application.businessName}`,
      heading: 'New reseller application',
      rows: [['Customer', application.customerName], ['Email', application.customerEmail], ['Business name', application.businessName]],
      text: { label: 'Reason', value: application.reason },
      portalPath: '/portal/reseller-applications',
      dedupeKey: application.id,
    });
  }

  /** Someone wrote to the shop's WhatsApp number. One alert per person per ten minutes, so a conversation is one nudge, not twenty. */
  async notifyWhatsAppMessage(message: { id?: string; from: string; name?: string | null; text?: string | null; type?: string; adHeadline?: string | null; at?: Date }) {
    if (await this.alerts.isOwnNumber(message.from)) return;
    const bucket = Math.floor((message.at ?? new Date()).getTime() / 600_000);
    await this.alerts.notify({
      kind: 'whatsapp.message',
      subject: `WhatsApp message${message.name ? ` from ${message.name}` : ''}`,
      heading: 'A customer messaged you on WhatsApp',
      rows: [
        ['From', message.name ? `${message.name} (+${message.from})` : `+${message.from}`],
        ['Came from an ad', message.adHeadline],
      ],
      text: { label: 'Message', value: message.text?.trim() || `(${message.type && message.type !== 'text' ? `a ${message.type}` : 'no text'})` },
      followUp: { phone: message.from },
      dedupeKey: `${message.from}:${bucket}`,
    });
  }

  async notifyReview(review: { id?: string; product: string; rating: number; name: string; text?: string | null }) {
    await this.alerts.notify({
      kind: 'review.submitted',
      subject: `New review: ${review.rating}★ ${review.product}`,
      heading: 'A customer left a review',
      rows: [['Product', review.product], ['Rating', `${review.rating} of 5`], ['From', review.name]],
      text: review.text ? { label: 'Review', value: review.text } : undefined,
      portalPath: '/portal/reviews',
      dedupeKey: review.id,
    });
  }

  async notifyFacebookComment(comment: { commentId: string; fromName?: string | null; message?: string | null }) {
    await this.alerts.notify({
      kind: 'facebook.comment',
      subject: `Facebook comment${comment.fromName ? ` from ${comment.fromName}` : ''}`,
      heading: 'New comment on your Facebook Page',
      rows: [['From', comment.fromName || 'Someone']],
      text: { label: 'Comment', value: comment.message?.trim() || '(no text)' },
      portalPath: '/portal/outreach',
      dedupeKey: comment.commentId,
    });
  }
}
