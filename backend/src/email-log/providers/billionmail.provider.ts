import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider, EmailSendParams, EmailSendResult } from './email-provider';

/**
 * BillionMail, self-hosted.
 *
 * Its send API is shaped differently from every hosted provider: the request
 * carries a recipient and a bag of template variables, and nothing else. The
 * subject and body belong to a template configured in the BillionMail
 * dashboard when the API key is created -- they cannot be supplied per send.
 *
 * This app builds its bodies at send time (a reset link, an invoice, a
 * reminder), so the only way through is to pass them as template variables and
 * have the template render them. The template must therefore be:
 *
 *     Subject:  {{.API.subject}}
 *     Body:     {{.API.html_body}}
 *
 * with the body block set to output raw HTML rather than escaping it. Without
 * that, mail will send but arrive blank or with markup showing as text.
 *
 * BILLIONMAIL_BASE_URL is required as well as the key: BillionMail runs on the
 * operator's own server, so there is no default host to fall back on.
 *
 * Verified against a live install: POST {base}/api/batch_mail/api/send with an
 * X-API-Key header and a {recipient, addresser?, attribs} body. TLS is not
 * bypassed -- the published docs show curl -k, but a real deployment behind a
 * proper certificate does not need it, and disabling verification to save one
 * line of setup would expose every send to interception.
 */
@Injectable()
export class BillionMailProvider implements EmailProvider {
  readonly name = 'billionmail';
  private readonly logger = new Logger(BillionMailProvider.name);

  private readonly apiKey = process.env.BILLIONMAIL_API_KEY || '';
  private readonly baseUrl = (process.env.BILLIONMAIL_BASE_URL || '').replace(/\/+$/, '');
  /**
   * Optional sender override, normally left unset.
   *
   * BillionMail can only send as a mailbox that exists on its server with a
   * password. Naming an address that was never created there fails the whole
   * send with code 1005. Unset, BillionMail uses the sender configured on the
   * API entry, which is a real mailbox by construction -- so the safe default
   * is to send nothing and let the server decide.
   */
  private readonly senderEmail = process.env.BILLIONMAIL_SENDER_EMAIL || '';

  get isConfigured() {
    return Boolean(this.apiKey && this.baseUrl);
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.isConfigured) {
      const missing = [
        this.apiKey ? null : 'BILLIONMAIL_API_KEY',
        this.baseUrl ? null : 'BILLIONMAIL_BASE_URL',
      ]
        .filter(Boolean)
        .join(' and ');
      this.logger.warn(`${missing} not set — skipping "${params.subject}" to ${params.to}`);
      return { delivered: false, error: `${missing} not configured` };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/batch_mail/api/send`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          recipient: params.to,
          ...(this.senderEmail ? { addresser: this.senderEmail } : {}),
          // The only channel the API offers for per-send content.
          attribs: {
            subject: params.subject,
            html_body: params.html,
            ...(params.replyTo ? { reply_to: params.replyTo.email } : {}),
          },
        }),
        // This is the last provider in the fallback chain -- a hung request
        // here (a slow or unreachable BillionMail server) would otherwise
        // block whatever triggered the email (checkout, signup, a password
        // reset) indefinitely, with no earlier provider left to fall through
        // to. Fail fast instead: 10s is generous for a plain POST and still
        // short enough that a caller's own request doesn't hang alongside it.
        signal: AbortSignal.timeout(10_000),
      });

      const text = await response.text();
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }

      if (!response.ok) {
        const error = `BillionMail responded ${response.status}: ${text.slice(0, 300)}`;
        this.logger.error(error);
        return { delivered: false, error };
      }

      // A 200 is not a send: BillionMail reports failures in the body with its
      // own codes (1001 bad key, 1002 IP not allowed, 1003 bad recipient,
      // 1004 missing template, 1005 send failed). Trusting the status alone
      // would log every one of those as delivered.
      if (body && body.success === false) {
        let error = `BillionMail error ${body.code ?? '?'}: ${body.msg || 'send failed'}`;

        // Two rejections have a cause that is not obvious from the message, and
        // both are configuration rather than code. Saying so here saves the
        // next person the round of guessing this one took.
        if (String(body.msg || '').includes('password not found')) {
          error += this.senderEmail
            ? ` — BILLIONMAIL_SENDER_EMAIL is set to "${this.senderEmail}", which is not a mailbox on the BillionMail server. Create it there, or clear the variable to use the API entry's own sender.`
            : ' — the API entry\'s sender is not a mailbox with a password on the BillionMail server.';
        } else if (body.code === 1001) {
          error += ' — the key must come from an API entry created in the BillionMail dashboard.';
        }

        this.logger.error(error);
        return { delivered: false, error };
      }

      return { delivered: true };
    } catch (caught) {
      const timedOut = caught instanceof Error && caught.name === 'TimeoutError';
      const error = timedOut
        ? `BillionMail request timed out after 10s — ${this.baseUrl} did not respond`
        : caught instanceof Error ? caught.message : String(caught);
      this.logger.error(`BillionMail request failed: ${error}`);
      return { delivered: false, error };
    }
  }
}
