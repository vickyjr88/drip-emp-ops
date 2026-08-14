import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogService } from './email-log.service';

@Module({
  imports: [PrismaModule],
  providers: [EmailLogService],
  exports: [EmailLogService],
})
export class EmailLogModule {}
