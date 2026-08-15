import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { EmailProvider, EmailSendParams, EmailSendResult } from './email-provider';

/**
 * Plain SMTP via nodemailer.
 *
 * Preferred over the BillionMail HTTP API for the same server: SMTP takes the
 * subject and body directly, where that API takes neither -- it renders a
 * template chosen when the key was issued, so every message had to be smuggled
 * through template variables and arrived blank if the template was not set up
 * to expect them.
 *
 * The transport is created once and reused. Nodemailer pools connections, so
 * a burst of reminders does not open a socket per message.
 */
@Injectable()
export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly logger = new Logger(SmtpProvider.name);

  private readonly host = process.env.SMTP_HOST || '';
  private readonly port = Number(process.env.SMTP_PORT || 587);
  private readonly user = process.env.SMTP_USER || '';
  private readonly password = process.env.SMTP_PASSWORD || '';
  private readonly fromEmail = process.env.SMTP_FROM_EMAIL || this.user;
  private readonly fromName = process.env.SMTP_FROM_NAME || 'Drip Emporium';

  /**
   * Whether to accept a certificate that does not validate.
   *
   * Defaults to rejecting one. BillionMail ships a self-signed
   * *.billionmail.com certificate that does not match the mail domain, so a
   * stock install needs this set to 'false' to send at all -- but everything
   * here travels over that connection, password-reset links included, so it is
   * an explicit decision rather than a silent default. The real fix is to give
   * the mail server the certificate the domain already has.
   */
  private readonly rejectUnauthorized = process.env.SMTP_REJECT_UNAUTHORIZED !== 'false';

  private transporter: Transporter | null = null;

  get isConfigured() {
    return Boolean(this.host && this.user && this.password);
  }

  private get transport() {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.host,
        port: this.port,
        // 465 is implicit TLS; 587 and 25 start in the clear and upgrade.
        secure: this.port === 465,
        auth: { user: this.user, pass: this.password },
        tls: {
          rejectUnauthorized: this.rejectUnauthorized,
          servername: this.host,
        },
        pool: true,
        maxConnections: 3,
      });

      if (!this.rejectUnauthorized) {
        this.logger.warn(
          `SMTP certificate verification is OFF for ${this.host}. Mail is encrypted but the server is unverified — fix the certificate and remove SMTP_REJECT_UNAUTHORIZED=false.`,
        );
      }
    }
    return this.transporter;
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.isConfigured) {
      const missing = [
        this.host ? null : 'SMTP_HOST',
        this.user ? null : 'SMTP_USER',
        this.password ? null : 'SMTP_PASSWORD',
      ]
        .filter(Boolean)
        .join(', ');
      this.logger.warn(`${missing} not set — skipping "${params.subject}" to ${params.to}`);
      return { delivered: false, error: `${missing} not configured` };
    }

    try {
      await this.transport.sendMail({
        from: { address: this.fromEmail, name: this.fromName },
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.replyTo ? { replyTo: params.replyTo.email } : {}),
      });
      return { delivered: true };
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);

      // The two failures worth naming, because neither message says what to do.
      let error = `SMTP send failed: ${raw}`;
      if (/self.signed|unable to verify|CERT_/i.test(raw)) {
        error +=
          ' — the mail server presents a certificate that does not match its hostname. Install a valid one, or set SMTP_REJECT_UNAUTHORIZED=false to accept it.';
      } else if (/535|authentication|credentials/i.test(raw)) {
        error += ` — SMTP_USER "${this.user}" was rejected. Check the mailbox password.`;
      }

      this.logger.error(error);
      return { delivered: false, error };
    }
  }
}
