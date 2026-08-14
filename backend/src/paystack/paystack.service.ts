import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Paystack, kept behind one service.
 *
 * The secret key never leaves the server. The browser only ever sees the
 * public key and a transaction reference, so a tampered client can at worst
 * start a payment it cannot complete.
 *
 * Amounts are handled in the smallest unit throughout, because Paystack works
 * in kobo/cents and a stray float here becomes a customer charged the wrong
 * amount.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly base = 'https://api.paystack.co';

  private get secret() {
    return process.env.PAYSTACK_SECRET_KEY || '';
  }

  get configured() {
    return Boolean(this.secret);
  }

  /** KES 3,499.00 -> 349900. Rounded, never truncated. */
  static toSubunit(amount: number) {
    return Math.round(amount * 100);
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.configured) {
      throw new BadRequestException('Online payment is not configured. Pay on collection instead.');
    }

    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || body?.status === false) {
      // Paystack's own message is usually the useful one ("Invalid amount"),
      // so it is surfaced rather than a generic failure.
      this.logger.warn(`Paystack ${path} failed: ${body?.message || response.status}`);
      throw new BadRequestException(body?.message || 'Payment provider rejected the request.');
    }
    return body.data as T;
  }

  /** Starts a transaction and returns the URL the customer is sent to. */
  initialise(params: {
    email: string;
    amountKes: number;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.call<{ authorization_url: string; access_code: string; reference: string }>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          amount: PaystackService.toSubunit(params.amountKes),
          currency: 'KES',
          reference: params.reference,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
      },
    );
  }

  /**
   * Asks Paystack what actually happened.
   *
   * The browser returning from checkout proves nothing -- anyone can visit the
   * callback URL -- so the order is only settled on what this returns, or on a
   * verified webhook.
   */
  verify(reference: string) {
    return this.call<{ status: string; amount: number; currency: string; reference: string }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }

  /**
   * Checks a webhook really came from Paystack.
   *
   * Compared in constant time: a plain === leaks, through timing, how much of
   * a forged signature was correct, which is enough to guess the rest.
   */
  verifySignature(rawBody: Buffer | string, signature?: string) {
    if (!this.configured || !signature) return false;

    const expected = createHmac('sha512', this.secret)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
      .digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
