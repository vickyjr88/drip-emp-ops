import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { DailyReportController } from './daily-report.controller';
import { DailyReportQueueService } from './daily-report-queue.service';
import { DailyReportService } from './daily-report.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [PrismaModule, EmailLogModule],
  controllers: [DailyReportController],
  providers: [DailyReportService, DailyReportQueueService, WhatsAppService],
})
export class DailyReportModule {}
