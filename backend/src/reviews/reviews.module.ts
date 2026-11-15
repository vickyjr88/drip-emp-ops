import { Module } from '@nestjs/common';
import { DailyReportModule } from '../daily-report/daily-report.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppOutreachModule } from '../whatsapp-outreach/whatsapp-outreach.module';
import { ReviewsAdminController, ReviewsPublicController } from './reviews.controller';
import { ReviewRequestsService } from './review-requests.service';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [PrismaModule, DailyReportModule, EmailLogModule, WhatsAppOutreachModule],
  controllers: [ReviewsPublicController, ReviewsAdminController],
  providers: [ReviewsService, ReviewRequestsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
