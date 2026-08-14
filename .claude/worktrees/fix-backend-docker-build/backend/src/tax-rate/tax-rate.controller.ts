import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { TaxRateService } from './tax-rate.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('tax-rates')
@Controller('tax-rates')
export class TaxRateController {
  constructor(private readonly service: TaxRateService) {}

  @Post()
  @Permissions(buildPermissionKey('TaxRate', 'create'))
  create(@Body() dto: CreateTaxRateDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('TaxRate', 'read'))
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Get(':id')
  @Permissions(buildPermissionKey('TaxRate', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('TaxRate', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateTaxRateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('TaxRate', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
