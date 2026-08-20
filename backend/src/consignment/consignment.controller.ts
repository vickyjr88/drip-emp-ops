import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ConsignmentService } from './consignment.service';
import { CreateConsignmentDto, SettleConsignmentDto } from './dto/consignment.dto';
import { ConsignmentQueryDto } from './dto/consignment-query.dto';

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
  findAll(@Query() query: ConsignmentQueryDto) {
    return this.service.findAll(query);
  }

  // Declared before ":id" so the literal path is not read as a consignment id.
  @Get('stats')
  @Permissions(buildPermissionKey('Consignment', 'read'))
  stats() {
    return this.service.stats();
  }

  @Get('activity')
  @Permissions(buildPermissionKey('Consignment', 'read'))
  activity(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.service.activity(from, to, storeId);
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
