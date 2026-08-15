import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSenderService } from './email-sender.service';

@Injectable()
export class EmailLogService {
  private readonly logger = new Logger(EmailLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: EmailSenderService,
  ) {}

  /**
   * Sends through Brevo and records the attempt so invoices, supplier invoices
   * and inquiries all carry an audit trail of who was emailed and when.
   *
   * Never throws: a failed send is recorded as FAILED and returned to the
   * caller, so business operations don't hinge on the mail provider being up.
   * Callers that pass no `html` only get the audit row (no send attempt).
   */
  async send(params: {
    recipient: string;
    subject: string;
    html?: string;
    replyTo?: { email: string; name?: string };
    invoiceId?: string;
    supplierInvoiceId?: string;
  }) {
    const result = params.html
      ? await this.sender.send({
          to: params.recipient,
          subject: params.subject,
          html: params.html,
          replyTo: params.replyTo,
        })
      : { delivered: false, error: 'No message body supplied' };

    const log = await this.prisma.emailLog.create({
      data: {
        recipient: params.recipient,
        subject: params.subject,
        invoiceId: params.invoiceId,
        supplierInvoiceId: params.supplierInvoiceId,
        status: result.delivered ? 'SENT' : 'FAILED',
        errorMessage: result.error,
        sentAt: result.delivered ? new Date() : null,
      },
    });

    if (result.delivered) {
      this.logger.log(`Sent email "${params.subject}" to ${params.recipient} (log ${log.id})`);
    } else {
      this.logger.warn(
        `Email "${params.subject}" to ${params.recipient} not delivered: ${result.error} (log ${log.id})`,
      );
    }

    return log;
  }

  findAll(params: { invoiceId?: string; supplierInvoiceId?: string; inquiryId?: string }) {
    return this.prisma.emailLog.findMany({
      where: {
        ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
        ...(params.supplierInvoiceId ? { supplierInvoiceId: params.supplierInvoiceId } : {}),
        ...(params.inquiryId ? { inquiryId: params.inquiryId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
