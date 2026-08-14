import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { ChartOfAccountService } from './chart-of-account.service';
import { CreateChartOfAccountDto } from './dto/create-chart-of-account.dto';
import { UpdateChartOfAccountDto } from './dto/update-chart-of-account.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('chart-of-accounts')
@Controller('chart-of-accounts')
export class ChartOfAccountController {
  constructor(private readonly service: ChartOfAccountService) {}

  @Post()
  @Permissions(buildPermissionKey('ChartOfAccount', 'create'))
  create(@Body() dto: CreateChartOfAccountDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('ChartOfAccount', 'read'))
  findAll(@Query('type') type?: string, @Query('isActive') isActive?: string) {
    return this.service.findAll({ type, isActive });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('ChartOfAccount', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('ChartOfAccount', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateChartOfAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('ChartOfAccount', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
