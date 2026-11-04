import { Module } from '@nestjs/common';
import { DailyReportModule } from '../daily-report/daily-report.module';
import { PageContentModule } from '../page-content/page-content.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppOutreachController } from './whatsapp-outreach.controller';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';

@Module({
  imports: [PrismaModule, DailyReportModule, PageContentModule],
  controllers: [WhatsAppOutreachController],
  providers: [WhatsAppOutreachService],
})
export class WhatsAppOutreachModule {}
