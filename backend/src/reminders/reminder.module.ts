import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { SmsService } from '../notifications/sms.service';
import { ReminderTargetService } from './reminder-target.service';
import { ReminderEngineService } from './reminder-engine.service';
import { ReminderQueueService } from './reminder-queue.service';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';

@Module({
  imports: [PrismaModule, EmailLogModule],
  controllers: [ReminderController],
  providers: [
    SmsService,
    ReminderTargetService,
    ReminderEngineService,
    ReminderQueueService,
    ReminderService,
  ],
  exports: [ReminderService],
})
export class ReminderModule {}
