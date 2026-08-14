import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RentalPaymentService } from './rental-payment.service';
import { RentalPaymentController } from './rental-payment.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RentalPaymentController],
  providers: [RentalPaymentService],
})
export class RentalPaymentModule {}
