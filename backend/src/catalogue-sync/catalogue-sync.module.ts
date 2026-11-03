import { Global, Module } from '@nestjs/common';
import { CatalogueSyncService } from './catalogue-sync.service';

// Global so the product and data-import services can inject it without each module importing it.
@Global()
@Module({
  providers: [CatalogueSyncService],
  exports: [CatalogueSyncService],
})
export class CatalogueSyncModule {}
