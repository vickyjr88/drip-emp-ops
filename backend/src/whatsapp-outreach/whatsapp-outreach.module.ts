import { Module } from '@nestjs/common';
import { DailyReportModule } from '../daily-report/daily-report.module';
import { MauticModule } from '../mautic/mautic.module';
import { PageContentModule } from '../page-content/page-content.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppOutreachController } from './whatsapp-outreach.controller';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';
import { WhatsappContactsController } from './whatsapp-contacts.controller';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { WhatsappMauticSyncService } from './whatsapp-mautic-sync.service';
import { WhatsappSequenceService } from './whatsapp-sequence.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [PrismaModule, DailyReportModule, PageContentModule, MauticModule],
  controllers: [WhatsAppOutreachController, WhatsappContactsController, WhatsappWebhookController],
  providers: [WhatsAppOutreachService, WhatsappContactsService, WhatsappSequenceService, WhatsappMauticSyncService],
})
export class WhatsAppOutreachModule {}
