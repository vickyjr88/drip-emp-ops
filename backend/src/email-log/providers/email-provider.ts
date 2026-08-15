/**
 * What the app needs from an email provider, and nothing more.
 *
 * Every caller sends the same thing: one recipient, a subject, an HTML body,
 * and sometimes a reply-to. Providers differ wildly beneath that -- Brevo takes
 * the body in the request, BillionMail takes a template id and variables -- so
 * the difference is absorbed by each adapter rather than leaking into the
 * twenty-odd call sites that just want to send a message.
 */
export type EmailSendParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: { email: string; name?: string };
};

export type EmailSendResult = {
  delivered: boolean;
  /** Why it did not go, for the EmailLog row and the operator reading it. */
  error?: string;
};

export interface EmailProvider {
  /** Name shown in logs, so which provider handled a send is never a guess. */
  readonly name: string;
  /** False when the provider lacks the configuration to send anything. */
  readonly isConfigured: boolean;
  send(params: EmailSendParams): Promise<EmailSendResult>;
}
