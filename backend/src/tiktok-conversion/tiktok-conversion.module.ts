import { Module } from '@nestjs/common';
import { TikTokConversionService } from './tiktok-conversion.service';

@Module({
  providers: [TikTokConversionService],
  exports: [TikTokConversionService],
})
export class TikTokConversionModule {}
