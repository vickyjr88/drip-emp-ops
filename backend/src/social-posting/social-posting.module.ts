import { Module } from '@nestjs/common';
import { PageContentModule } from '../page-content/page-content.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { SocialPostingController } from './social-posting.controller';
import { SocialPostingService } from './social-posting.service';

@Module({
  imports: [PrismaModule, PageContentModule, StorefrontModule],
  controllers: [SocialPostingController],
  providers: [SocialPostingService],
})
export class SocialPostingModule {}
