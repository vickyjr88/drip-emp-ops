import { Module } from '@nestjs/common';
import { PageContentModule } from '../page-content/page-content.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FacebookCommentsController } from './facebook-comments.controller';
import { FacebookCommentsService } from './facebook-comments.service';
import { FacebookWebhookController } from './facebook-webhook.controller';

@Module({
  imports: [PrismaModule, PageContentModule],
  controllers: [FacebookCommentsController, FacebookWebhookController],
  providers: [FacebookCommentsService],
})
export class FacebookCommentsModule {}
