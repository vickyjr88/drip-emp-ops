import { Module } from '@nestjs/common';
import { DailyReportModule } from '../daily-report/daily-report.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppOutreachController } from './whatsapp-outreach.controller';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';

@Module({
  imports: [PrismaModule, DailyReportModule],
  controllers: [WhatsAppOutreachController],
  providers: [WhatsAppOutreachService],
})
export class WhatsAppOutreachModule {}
