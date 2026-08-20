import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InquiryStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { InquiryService } from './inquiry.service';
import { CreateInquiryDto } from './dto/inquiry.dto';
import { InquiryQueryDto } from './dto/inquiry-query.dto';

@ApiTags('inquiries')
@Controller()
export class InquiryController {
  constructor(private readonly service: InquiryService) {}

  /** The contact form, unauthenticated like every other public storefront write. */
  @Public()
  @Post('public/inquiries')
  create(@Body() dto: CreateInquiryDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Get('inquiries')
  @Permissions(buildPermissionKey('Inquiry', 'read'))
  findAll(@Query() query: InquiryQueryDto) {
    return this.service.findAll(query);
  }

  @ApiBearerAuth()
  @Patch('inquiries/:id/status')
  @Permissions(buildPermissionKey('Inquiry', 'update'))
  setStatus(@Param('id') id: string, @Body() body: { status: InquiryStatus }) {
    return this.service.setStatus(id, body.status);
  }
}
