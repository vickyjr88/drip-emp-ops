import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PageContentService } from './page-content.service';
import { PageContentController } from './page-content.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PageContentController],
  providers: [PageContentService],
})
export class PageContentModule {}
