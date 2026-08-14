import { Module } from '@nestjs/common';
import { CustomerPaymentService } from './customer-payment.service';
import { CustomerPaymentController } from './customer-payment.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PrismaModule, PdfModule],
  controllers: [CustomerPaymentController],
  providers: [CustomerPaymentService],
})
export class CustomerPaymentModule {}
