import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';

@Module({
  imports: [
    PrismaModule,
    // For OptionalCustomerAuthGuard's underlying customer-jwt strategy, so a
    // logged-in reseller browsing the shop sees their own tier's price.
    CustomerPortalModule,
  ],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
