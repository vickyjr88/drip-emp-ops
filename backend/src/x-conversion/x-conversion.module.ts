import { Module } from '@nestjs/common';
import { XConversionService } from './x-conversion.service';

@Module({
  providers: [XConversionService],
  exports: [XConversionService],
})
export class XConversionModule {}
