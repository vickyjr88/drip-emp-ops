import { Injectable, Logger } from '@nestjs/common';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export type BrevoSendParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: { email: string; name?: string };
};

export type BrevoSendResult = {
  delivered: boolean;
  /** Populated when Brevo rejected the send, or when no API key is configured. */
  error?: string;
};

/**
 * Thin wrapper over Brevo's transactional email API. Uses fetch directly rather
 * than the SDK so nothing extra has to build in the Alpine runtime image.
 *
 * When BREVO_API_KEY is unset (local dev, CI) sends are skipped and reported as
 * undelivered rather than throwing, so callers can record the attempt and carry
 * on — a visitor's inquiry must never fail because email is unavailable.
 */
@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);

  private readonly apiKey = process.env.BREVO_API_KEY || '';
  private readonly senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@dirrir.com';
  private readonly senderName = process.env.BREVO_SENDER_NAME || 'Dirrir Realtors';

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  async send(params: BrevoSendParams): Promise<BrevoSendResult> {
    if (!this.isConfigured) {
      this.logger.warn(
        `BREVO_API_KEY not set — skipping email "${params.subject}" to ${params.to}`,
      );
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
