import { Injectable, Logger } from '@nestjs/common';
import { BrevoProvider } from './providers/brevo.provider';
import { BillionMailProvider } from './providers/billionmail.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { EmailProvider, EmailSendParams, EmailSendResult } from './providers/email-provider';
import { wrapEmailHtml } from './email-html.util';

/**
 * Chooses which provider sends the mail.
 *
 * EMAIL_PROVIDER, when set, forces exactly one provider and disables fallback
 * entirely -- for locking to Brevo during SMTP maintenance, say. Left unset,
 * every send tries providers in priority order -- smtp, then brevo, then
 * billionMail -- moving to the next only when the one before it fails to
 * deliver. smtp is first because that is where the operator's self-hosted
 * BillionMail SMTP credentials go: the intended primary, kept for cost and
 * control, with Brevo as the fallback and BillionMail's HTTP API a last
 * resort. Trying the next provider is a per-send decision, not a per-boot
 * one: a transient SMTP outage must not silently drop mail for the rest of
 * the process's life.
 */
@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private readonly providers: EmailProvider[];
  private readonly forcedRequested: string;
  private readonly forced: EmailProvider | null;

  constructor(smtp: SmtpProvider, brevo: BrevoProvider, billionMail: BillionMailProvider) {
    this.providers = [smtp, brevo, billionMail];

    this.forcedRequested = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
    if (this.forcedRequested) {
      const match = this.providers.find((provider) => provider.name === this.forcedRequested);
      if (!match) {
        this.logger.error(
          `EMAIL_PROVIDER="${this.forcedRequested}" is not a provider. Known: ${this.providers
            .map((provider) => provider.name)
            .join(', ')}. No email will be sent.`,
        );
      } else if (!match.isConfigured) {
        // Named explicitly but unusable: falling back to another provider would
        // send from the wrong domain, which is worse than not sending.
        this.logger.error(`EMAIL_PROVIDER="${this.forcedRequested}" is selected but not configured.`);
      }
      this.forced = match ?? null;
    } else {
      this.forced = null;
    }

    const configured = this.providers.filter((provider) => provider.isConfigured).map((provider) => provider.name);
    if (this.forcedRequested) {
      this.logger.log(
        this.forced?.isConfigured
          ? `EMAIL_PROVIDER forces ${this.forced.name} — automatic fallback disabled`
          : `EMAIL_PROVIDER="${this.forcedRequested}" is not usable — no email will be sent`,
      );
    } else if (configured.length) {
      this.logger.log(`Email fallback order: ${configured.join(' -> ')}`);
    } else {
      this.logger.warn('No email provider is configured — sends will be recorded but not delivered');
    }
  }

  /** Which provider would handle the next send, for the health endpoint and diagnosis. */
  get providerName() {
    if (this.forcedRequested) return this.forced?.isConfigured ? this.forced.name : 'none';
    return this.providers.find((provider) => provider.isConfigured)?.name ?? 'none';
  }

  get isConfigured() {
    if (this.forcedRequested) return Boolean(this.forced?.isConfigured);
    return this.providers.some((provider) => provider.isConfigured);
  }

  /**
   * Every caller still builds the same bare content fragment it always has
   * (a <h2>, a few <p> rows, a <ul>) -- wrapping it in the branded shell here,
   * once, means none of them needed to change to pick up the new look,
   * including reminder-engine's operator-edited ReminderRule.emailTemplate,
   * which is just another fragment as far as this is concerned.
   */
  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const branded: EmailSendParams = { ...params, html: wrapEmailHtml(params.subject, params.html) };

    if (this.forcedRequested) {
      if (!this.forced?.isConfigured) {
        return { delivered: false, error: `EMAIL_PROVIDER="${this.forcedRequested}" is not available` };
      }
      return this.forced.send(branded);
    }

    let lastResult: EmailSendResult = { delivered: false, error: 'No email provider configured' };
    let attempted = false;

    for (const provider of this.providers) {
      if (!provider.isConfigured) continue;
      attempted = true;

      try {
        lastResult = await provider.send(branded);
      } catch (error) {
        lastResult = { delivered: false, error: error instanceof Error ? error.message : String(error) };
      }

      if (lastResult.delivered) return lastResult;

      this.logger.warn(
        `${provider.name} failed to deliver "${params.subject}" to ${params.to}: ${lastResult.error} — trying next provider`,
      );
    }

    // The last failure, so the EmailLog row explains what actually went
    // wrong rather than a generic "no provider" when one was tried and lost.
    return attempted ? lastResult : { delivered: false, error: 'No email provider configured' };
  }
}
