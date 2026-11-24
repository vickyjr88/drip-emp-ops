import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { CampaignModule } from '../campaign/campaign.module';
import { XConversionModule } from '../x-conversion/x-conversion.module';
import { TikTokConversionModule } from '../tiktok-conversion/tiktok-conversion.module';
import { MauticModule } from '../mautic/mautic.module';
import { DailyReportModule } from '../daily-report/daily-report.module';
import { CartLeadService } from './cart-lead.service';
import { CartLeadController } from './cart-lead.controller';
import { CartReminderQueueService } from './cart-reminder-queue.service';
import { CartReminderEmailService } from './cart-reminder-email';
import { LeadFollowUpService } from './lead-followup.service';

@Module({
  imports: [PrismaModule, EmailLogModule, CampaignModule, XConversionModule, TikTokConversionModule, MauticModule, DailyReportModule],
  controllers: [CartLeadController],
  providers: [CartLeadService, CartReminderQueueService, CartReminderEmailService, LeadFollowUpService],
  exports: [LeadFollowUpService],
})
export class CartLeadModule {}
