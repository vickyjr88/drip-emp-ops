import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
