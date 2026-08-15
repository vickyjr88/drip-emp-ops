import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConsignmentStatus } from '@prisma/client';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ConsignmentService } from './consignment.service';
import { CreateConsignmentDto, SettleConsignmentDto } from './dto/consignment.dto';

@ApiBearerAuth()
@ApiTags('consignments')
@Controller('consignments')
export class ConsignmentController {
  constructor(private readonly service: ConsignmentService) {}

  @Post()
  @Permissions(buildPermissionKey('Consignment', 'create'))
  create(@Body() dto: CreateConsignmentDto, @Req() request: any) {
    return this.service.create(dto, request?.user?.email || 'system');
  }

  @Get()
  @Permissions(buildPermissionKey('Consignment', 'read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: ConsignmentStatus,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    return this.service.findAll({ customerId, storeId, status, overdueOnly });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Consignment', 'read'))
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/settle')
  @Permissions(buildPermissionKey('Consignment', 'update'))
  settle(@Param('id') id: string, @Body() dto: SettleConsignmentDto, @Req() request: any) {
    return this.service.settle(id, dto, request?.user?.email || 'system');
  }

  @Patch(':id/write-off')
  @Permissions(buildPermissionKey('Consignment', 'update'))
  writeOff(@Param('id') id: string, @Body() body: { reason: string }, @Req() request: any) {
    return this.service.writeOff(id, body?.reason || 'Not returned', request?.user?.email || 'system');
  }
}
