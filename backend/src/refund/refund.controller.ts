import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { RefundService } from './refund.service';
import { ApproveRefundDto, CreateRefundDto, RejectRefundDto } from './dto/create-refund.dto';
import { RefundQueryDto } from './dto/refund-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('refunds')
@Controller('refunds')
export class RefundController {
  constructor(private readonly service: RefundService) {}

  @Post()
  @Permissions(buildPermissionKey('Refund', 'create'))
  request(@Body() dto: CreateRefundDto) {
    return this.service.request(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Refund', 'read'))
  findAll(@Query() query: RefundQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Refund', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/approve')
  @Permissions(buildPermissionKey('Refund', 'update'))
  approve(@Param('id') id: string, @Body() dto: ApproveRefundDto) {
    return this.service.approve(id, dto);
  }

  @Post(':id/reject')
  @Permissions(buildPermissionKey('Refund', 'update'))
  reject(@Param('id') id: string, @Body() dto: RejectRefundDto) {
    return this.service.reject(id, dto);
  }
}
