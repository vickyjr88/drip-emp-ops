import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerDocumentController } from './customer-document.controller';
import { CustomerDocumentService } from './customer-document.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerDocumentController],
  providers: [CustomerDocumentService],
})
export class CustomerDocumentModule {}
