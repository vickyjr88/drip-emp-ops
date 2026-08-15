import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogService } from './email-log.service';
import { EmailSenderService } from './email-sender.service';
import { BrevoProvider } from './providers/brevo.provider';
import { BillionMailProvider } from './providers/billionmail.provider';
import { SmtpProvider } from './providers/smtp.provider';

@Module({
  imports: [PrismaModule],
  providers: [EmailLogService, EmailSenderService, SmtpProvider, BrevoProvider, BillionMailProvider],
  exports: [EmailLogService, EmailSenderService],
})
export class EmailLogModule {}
