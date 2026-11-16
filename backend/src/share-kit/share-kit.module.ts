import { Module } from '@nestjs/common';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { PageContentModule } from '../page-content/page-content.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { ShareKitController } from './share-kit.controller';
import { ShareKitService } from './share-kit.service';

@Module({
  // CustomerPortalModule brings the customer-jwt strategy that CustomerAuthGuard needs.
  imports: [CustomerPortalModule, PageContentModule, StorefrontModule],
  controllers: [ShareKitController],
  providers: [ShareKitService],
})
export class ShareKitModule {}
