import { Injectable, Logger } from '@nestjs/common';
import { BrevoProvider } from './providers/brevo.provider';
import { BillionMailProvider } from './providers/billionmail.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { EmailProvider, EmailSendParams, EmailSendResult } from './providers/email-provider';

/**
 * Chooses which provider sends the mail.
 *
 * EMAIL_PROVIDER picks one by name. Left unset, the first provider that is
 * actually configured wins, so adding a key to .env is enough to switch and
 * nothing silently keeps using the old one after its key is removed.
 *
 * The choice is resolved once at construction rather than per send: a provider
 * changing halfway through a run would make the EmailLog impossible to read.
 */
@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private readonly providers: EmailProvider[];
  private readonly active: EmailProvider | null;

  constructor(smtp: SmtpProvider, brevo: BrevoProvider, billionMail: BillionMailProvider) {
    // SMTP first: it is the plainest of the three and takes subject and body
    // directly, so it is the right default when more than one is configured.
    this.providers = [smtp, brevo, billionMail];

    const requested = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
    if (requested) {
      const match = this.providers.find((provider) => provider.name === requested);
      if (!match) {
        this.logger.error(
          `EMAIL_PROVIDER="${requested}" is not a provider. Known: ${this.providers
            .map((provider) => provider.name)
            .join(', ')}. No email will be sent.`,
        );
      } else if (!match.isConfigured) {
        // Named explicitly but unusable: falling back to another provider would
        // send from the wrong domain, which is worse than not sending.
        this.logger.error(`EMAIL_PROVIDER="${requested}" is selected but not configured.`);
      }
      this.active = match ?? null;
    } else {
      this.active = this.providers.find((provider) => provider.isConfigured) ?? null;
    }

    if (this.active?.isConfigured) {
      this.logger.log(`Sending email via ${this.active.name}`);
    } else {
      this.logger.warn('No email provider is configured — sends will be recorded but not delivered');
    }
  }

  /** Which provider is in use, for the health endpoint and for diagnosis. */
  get providerName() {
    return this.active?.name ?? 'none';
  }

  get isConfigured() {
    return Boolean(this.active?.isConfigured);
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.active) {
      return { delivered: false, error: 'No email provider configured' };
    }
    return this.active.send(params);
  }
}
