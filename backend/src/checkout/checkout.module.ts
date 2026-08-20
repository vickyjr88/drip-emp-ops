import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesPostingModule } from '../sales-posting/sales-posting.module';
import { PaystackModule } from '../paystack/paystack.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';

@Module({
  imports: [PrismaModule, InventoryModule, SalesPostingModule, PaystackModule, EmailLogModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
