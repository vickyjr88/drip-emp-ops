import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdSpendService } from './ad-spend.service';
import { BuyersService } from './buyers.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FunnelService } from './funnel.service';
import { InsightsController } from './insights.controller';
import { StockService } from './stock.service';
import { WhatsappReportService } from './whatsapp-report.service';

@Module({
  imports: [PrismaModule],
  controllers: [EventsController, InsightsController],
  providers: [EventsService, FunnelService, AdSpendService, StockService, BuyersService, WhatsappReportService],
})
export class InsightsModule {}
