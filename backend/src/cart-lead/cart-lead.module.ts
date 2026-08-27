import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { CartLeadService } from './cart-lead.service';
import { CartLeadController } from './cart-lead.controller';
import { CartReminderQueueService } from './cart-reminder-queue.service';
import { CartReminderEmailService } from './cart-reminder-email';

@Module({
  imports: [PrismaModule, EmailLogModule],
  controllers: [CartLeadController],
  providers: [CartLeadService, CartReminderQueueService, CartReminderEmailService],
})
export class CartLeadModule {}
