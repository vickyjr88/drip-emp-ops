import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RentalPaymentService } from './rental-payment.service';
import { CreateRentalPaymentDto } from './dto/create-rental-payment.dto';
import { UpdateRentalPaymentDto } from './dto/update-rental-payment.dto';
import { CollectionsQueryDto, RentalPaymentQueryDto } from '../common/dto/filter-pagination.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('rental-payments')
@Controller('rental-payments')
export class RentalPaymentController {
  constructor(private readonly service: RentalPaymentService) {}

  @Post()
  @Permissions(buildPermissionKey('RentalPayment', 'create'))
  create(@Body() dto: CreateRentalPaymentDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('RentalPayment', 'read'))
  findAll(@Query() query: RentalPaymentQueryDto) {
    return this.service.findAll(query);
  }

  @Get('collections')
  @Permissions(buildPermissionKey('RentalPayment', 'read'))
  collections(@Query() query: CollectionsQueryDto) {
    return this.service.collections(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('RentalPayment', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('RentalPayment', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateRentalPaymentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('RentalPayment', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
