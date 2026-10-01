import { Module } from '@nestjs/common';
import { MauticService } from './mautic.service';

@Module({
  providers: [MauticService],
  exports: [MauticService],
})
export class MauticModule {}
