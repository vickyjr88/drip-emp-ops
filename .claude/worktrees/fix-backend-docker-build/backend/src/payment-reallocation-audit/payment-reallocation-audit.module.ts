import { Module } from '@nestjs/common';
import { PaymentReallocationAuditService } from './payment-reallocation-audit.service';
import { PaymentReallocationAuditController } from './payment-reallocation-audit.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentReallocationAuditController],
  providers: [PaymentReallocationAuditService],
})
export class PaymentReallocationAuditModule {}
