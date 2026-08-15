import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider, EmailSendParams, EmailSendResult } from './email-provider';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo's transactional API. Uses fetch directly rather than the SDK so nothing
 * extra has to build in the Alpine runtime image.
 *
 * Sends never throw: with no API key they are skipped and reported as
 * undelivered, so callers can record the attempt and carry on -- a visitor's
 * inquiry must never fail because email is unavailable.
 */
@Injectable()
export class BrevoProvider implements EmailProvider {
  readonly name = 'brevo';
  private readonly logger = new Logger(BrevoProvider.name);

  private readonly apiKey = process.env.BREVO_API_KEY || '';
  private readonly senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@dripemporium.store';
  private readonly senderName = process.env.BREVO_SENDER_NAME || 'Drip Emporium';

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.isConfigured) {
      this.logger.warn(`BREVO_API_KEY not set — skipping "${params.subject}" to ${params.to}`);
      return { delivered: false, error: 'BREVO_API_KEY not configured' };
    }

    try {
      const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email: params.to }],
          subject: params.subject,
          htmlContent: params.html,
          ...(params.replyTo ? { replyTo: params.replyTo } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        const error = `Brevo responded ${response.status}: ${body.slice(0, 300)}`;
        this.logger.error(error);
        return { delivered: false, error };
      }

      return { delivered: true };
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      this.logger.error(`Brevo request failed: ${error}`);
      return { delivered: false, error };
    }
  }
}
