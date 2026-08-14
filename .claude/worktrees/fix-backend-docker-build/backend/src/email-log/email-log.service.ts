import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailLogService {
  private readonly logger = new Logger(EmailLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * No SMTP/mail provider is configured in this codebase yet. This records the
   * send attempt so invoices/supplier-invoices show an audit trail of who was
   * emailed and when — swap the body for a real transport once one is wired up.
   */
  async send(params: {
    recipient: string;
    subject: string;
    invoiceId?: string;
    supplierInvoiceId?: string;
  }) {
    const log = await this.prisma.emailLog.create({
      data: {
        recipient: params.recipient,
        subject: params.subject,
        invoiceId: params.invoiceId,
        supplierInvoiceId: params.supplierInvoiceId,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    this.logger.log(`Queued email "${params.subject}" to ${params.recipient} (log ${log.id})`);
    return log;
  }

  findAll(params: { invoiceId?: string; supplierInvoiceId?: string }) {
    return this.prisma.emailLog.findMany({
      where: {
        ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
        ...(params.supplierInvoiceId ? { supplierInvoiceId: params.supplierInvoiceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
