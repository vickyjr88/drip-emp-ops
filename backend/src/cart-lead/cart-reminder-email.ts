import { Injectable } from '@nestjs/common';
import type { CartLead } from '@prisma/client';
import { EmailSenderService } from '../email-log/email-sender.service';
import { escapeHtml, money, ctaButton } from '../email-log/email-html.util';
import { storefrontOrigin } from '../common/storefront-origin';

type CartLeadLine = { name: string; size: string; quantity: number };

/** The "you left something in your cart" nudge sent a day after the cart was
 *  first recorded abandoned -- customer-facing, unlike everything else in
 *  email-log which only tells the shop owner what happened. */
@Injectable()
export class CartReminderEmailService {
  constructor(private readonly email: EmailSenderService) {}

  async send(lead: CartLead) {
    const lines = (lead.lines as unknown as CartLeadLine[]) ?? [];
    const items = lines
      .map((line) => `<li>${escapeHtml(`${line.quantity} x ${line.name} (${line.size})`)}</li>`)
      .join('');
    const name = lead.customerName?.trim() || 'there';

    return this.email.send({
      to: lead.customerEmail!,
      subject: 'You left something in your cart',
      html: `<h2>Hi ${escapeHtml(name)}, your cart is still waiting</h2>
      <p>You've got items saved from your last visit:</p>
      <ul style="margin:0 0 16px">${items}</ul>
      <p><strong>Total: ${money(Number(lead.total))}</strong></p>
      <p>Head back to checkout whenever you're ready — nothing has been charged yet.</p>
      ${ctaButton(`${storefrontOrigin()}/cart`, 'Return to your cart')}`,
    });
  }
}
