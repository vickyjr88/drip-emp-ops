import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SitePhotoService } from './site-photo.service';
import { SitePhotoController } from './site-photo.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SitePhotoController],
  providers: [SitePhotoService],
})
export class SitePhotoModule {}
