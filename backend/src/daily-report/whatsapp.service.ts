import { Injectable, Logger } from '@nestjs/common';

export type WhatsAppSendResult = { delivered: boolean; messageId?: string; error?: string };

/**
 * WhatsApp Business Cloud API. A message to someone who has not written to the business in the last 24 hours must be
 * an approved template, so this only ever sends a template: the report's own text is the template's parameters.
 *
 * Needs, from developers.facebook.com > the app's WhatsApp > API setup:
 *   WHATSAPP_PHONE_NUMBER_ID   the sending number's id (not the phone number itself)
 *   WHATSAPP_ACCESS_TOKEN      a permanent System User token with whatsapp_business_messaging
 *   WHATSAPP_REPORT_TEMPLATE   the approved template's name (default daily_report)
 *   WHATSAPP_TEMPLATE_LANG     its language code (default en)
 *
 * Like the other senders it never throws: unconfigured, it reports "not delivered" so a report run is not aborted.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  private readonly template = process.env.WHATSAPP_REPORT_TEMPLATE || 'daily_report';
  private readonly language = process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  private readonly apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';

  get isConfigured() {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  get templateName() {
    return this.template;
  }

  /** The Cloud API wants digits only, with the country code: 254722000000. */
  normalisePhone(raw: string): string | null {
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('254') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
    if (digits.length === 9) return `254${digits}`;
    // Another country's number, already with its code.
    return digits.length >= 11 && digits.length <= 15 ? digits : null;
  }

  async sendTemplate(to: string, parameters: string[]): Promise<WhatsAppSendResult> {
    const phone = this.normalisePhone(to);
    if (!phone) return { delivered: false, error: `Unusable WhatsApp number "${to}"` };
    if (!this.isConfigured) return { delivered: false, error: 'WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not configured' };

    try {
      const response = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: this.template,
            language: { code: this.language },
            components: [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }],
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        const message = body?.error?.message ?? `HTTP ${response.status}`;
        this.logger.warn(`WhatsApp to ${phone} failed: ${message}`);
        return { delivered: false, error: message };
      }
      return { delivered: true, messageId: body?.messages?.[0]?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`WhatsApp to ${phone} threw: ${message}`);
      return { delivered: false, error: message };
    }
  }
}
