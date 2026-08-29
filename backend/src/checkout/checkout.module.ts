import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesPostingModule } from '../sales-posting/sales-posting.module';
import { PaystackModule } from '../paystack/paystack.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { CommissionModule } from '../commission/commission.module';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';

@Module({
  imports: [
    PrismaModule,
    InventoryModule,
    SalesPostingModule,
    PaystackModule,
    EmailLogModule,
    // For OptionalCustomerAuthGuard's underlying customer-jwt strategy, so a
    // logged-in reseller checking out is priced at their real tier.
    CustomerPortalModule,
    CommissionModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
