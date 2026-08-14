import { Injectable, Logger } from '@nestjs/common';

const AT_LIVE_ENDPOINT = 'https://api.africastalking.com/version1/messaging';
const AT_SANDBOX_ENDPOINT = 'https://api.sandbox.africastalking.com/version1/messaging';

export type SmsSendParams = {
  to: string;
  message: string;
};

export type SmsSendResult = {
  delivered: boolean;
  /** Africa's Talking message id, for cross-referencing delivery reports. */
  messageId?: string;
  cost?: string;
  error?: string;
};

/**
 * Africa's Talking SMS, over their form-encoded REST API via fetch.
 *
 * No SDK: the official package pulls native dependencies that would need
 * building in the Alpine runtime image, and this is a single POST. Mirrors
 * BrevoService deliberately -- sends never throw, and with no API key they are
 * skipped and reported undelivered rather than failing. A reminder run must not
 * abort because SMS credentials are missing.
 *
 * `AT_USERNAME=sandbox` routes to the sandbox host, which is how Africa's
 * Talking distinguishes test traffic.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private readonly apiKey = process.env.AT_API_KEY || '';
  private readonly username = process.env.AT_USERNAME || 'sandbox';
  private readonly senderId = process.env.AT_SENDER_ID || '';

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  private get endpoint() {
    return this.username === 'sandbox' ? AT_SANDBOX_ENDPOINT : AT_LIVE_ENDPOINT;
  }

  /**
   * Africa's Talking requires E.164. Local Kenyan numbers are stored in several
   * shapes (0722..., 722..., +254722...), so normalise rather than reject:
   * a reminder failing to send because of a leading zero is a poor trade.
   */
  normalisePhone(raw: string): string | null {
    if (!raw) return null;
    const digits = raw.replace(/[^\d+]/g, '');
    if (!digits) return null;

    if (digits.startsWith('+')) {
      return digits.length >= 10 ? digits : null;
    }
    if (digits.startsWith('254')) {
      return `+${digits}`;
    }
    if (digits.startsWith('0')) {
      return `+254${digits.slice(1)}`;
    }
    // Bare subscriber number, e.g. 722872539.
    if (digits.length === 9) {
      return `+254${digits}`;
    }
    return null;
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const to = this.normalisePhone(params.to);
    if (!to) {
      return { delivered: false, error: `Unusable phone number "${params.to}"` };
    }

    if (!this.isConfigured) {
      this.logger.warn(`AT_API_KEY not set — skipping SMS to ${to}`);
      return { delivered: false, error: 'AT_API_KEY not configured' };
    }

    try {
      const body = new URLSearchParams({
        username: this.username,
        to,
        message: params.message,
        ...(this.senderId ? { from: this.senderId } : {}),
      });

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          apiKey: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      });

      const payload: any = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.SMSMessageData?.Message || `HTTP ${response.status}`;
        this.logger.error(`Africa's Talking rejected SMS to ${to}: ${message}`);
        return { delivered: false, error: message };
      }

      // A 200 does not mean delivery: per-recipient status lives in the
      // Recipients array, and an invalid number comes back here rather than as
      // an HTTP error.
      const recipient = payload?.SMSMessageData?.Recipients?.[0];
      if (!recipient) {
        const message = payload?.SMSMessageData?.Message || 'No recipients accepted';
        return { delivered: false, error: message };
      }

      const accepted = recipient.status === 'Success';
      return {
        delivered: accepted,
        messageId: recipient.messageId,
        cost: recipient.cost,
        error: accepted ? undefined : `${recipient.status}: ${recipient.statusCode}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SMS send failed';
      this.logger.error(`Africa's Talking send to ${to} failed: ${message}`);
      return { delivered: false, error: message };
    }
  }
}
