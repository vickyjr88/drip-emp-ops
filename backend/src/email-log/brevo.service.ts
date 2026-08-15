/**
 * Kept so existing callers keep working after email became swappable.
 *
 * The name is now wrong -- this dispatches to whichever provider is
 * configured, which may not be Brevo -- but a handful of services inject
 * BrevoService, and renaming them all is churn that would obscure the actual
 * change. New code should inject EmailSenderService directly.
 *
 * @deprecated Inject EmailSenderService instead.
 */
export { EmailSenderService as BrevoService } from './email-sender.service';
export type {
  EmailSendParams as BrevoSendParams,
  EmailSendResult as BrevoSendResult,
} from './providers/email-provider';
