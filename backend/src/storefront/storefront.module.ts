import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
