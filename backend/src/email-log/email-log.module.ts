import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogService } from './email-log.service';
import { EmailSenderService } from './email-sender.service';
import { OwnerNotificationService } from './owner-notification.service';
import { BrevoProvider } from './providers/brevo.provider';
import { BillionMailProvider } from './providers/billionmail.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { AlertsService } from '../alerts/alerts.service';
import { AlertsController } from '../alerts/alerts.controller';

@Module({
  imports: [PrismaModule],
  // The alerts live here, not in a module of their own, because OwnerNotificationService (this module's) raises them and every module that
  // can raise one already imports this one.
  controllers: [AlertsController],
  providers: [
    AlertsService,
    WhatsAppService,
    EmailLogService,
    EmailSenderService,
    OwnerNotificationService,
    SmtpProvider,
    BrevoProvider,
    BillionMailProvider,
  ],
  exports: [EmailLogService, EmailSenderService, OwnerNotificationService, AlertsService],
})
export class EmailLogModule {}
