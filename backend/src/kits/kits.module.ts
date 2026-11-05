import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { MediaModule } from '../media/media.module';
import { PageContentModule } from '../page-content/page-content.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { KitsController } from './kits.controller';
import { KitsAdminController } from './kits-admin.controller';
import { KitsService } from './kits.service';
import { KitsEnabledGuard, KitsFlagService } from './kits.flag';

@Module({
  imports: [PrismaModule, CustomerPortalModule, MediaModule, PageContentModule, StorefrontModule],
  controllers: [KitsController, KitsAdminController],
  providers: [KitsService, KitsFlagService, KitsEnabledGuard],
  exports: [KitsService, KitsFlagService],
})
export class KitsModule {}
