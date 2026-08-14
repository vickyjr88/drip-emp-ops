import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnershipChangeAuditService } from './ownership-change-audit.service';
import { OwnershipChangeAuditController } from './ownership-change-audit.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OwnershipChangeAuditController],
  providers: [OwnershipChangeAuditService],
})
export class OwnershipChangeAuditModule {}
