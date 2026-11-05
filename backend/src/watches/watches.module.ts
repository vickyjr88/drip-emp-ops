import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { WatchesController } from './watches.controller';
import { WatchesAdminController } from './watches-admin.controller';
import { WatchesService } from './watches.service';

@Module({
  imports: [PrismaModule, CustomerPortalModule, StorefrontModule],
  controllers: [WatchesController, WatchesAdminController],
  providers: [WatchesService],
  exports: [WatchesService],
})
export class WatchesModule {}
