import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TaxRemittanceService } from './tax-remittance.service';
import { CreateTaxRemittanceDto } from './dto/create-tax-remittance.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('tax-remittances')
@Controller('tax-remittances')
export class TaxRemittanceController {
  constructor(private readonly service: TaxRemittanceService) {}

  @Post()
  @Permissions(buildPermissionKey('TaxRemittance', 'create'))
  create(@Body() dto: CreateTaxRemittanceDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('TaxRemittance', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('taxRateId') taxRateId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      taxRateId,
      projectId,
    });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('TaxRemittance', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
