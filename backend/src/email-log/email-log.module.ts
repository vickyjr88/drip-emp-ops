import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogService } from './email-log.service';
import { BrevoService } from './brevo.service';

@Module({
  imports: [PrismaModule],
  providers: [EmailLogService, BrevoService],
  exports: [EmailLogService, BrevoService],
})
export class EmailLogModule {}
