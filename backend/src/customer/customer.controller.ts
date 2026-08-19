import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { SetCustomerPortalAccessDto } from '../customer-portal/dto/customer-portal.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('customers')
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Post()
  @Permissions(buildPermissionKey('Customer', 'create'))
  create(@Body() dto: CreateCustomerDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Customer', 'read'))
  findAll(@Query() query: CustomerQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Customer', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Customer', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.service.update(id, dto);
  }

  /** Issues or resets this customer's portal password, and enables access. */
  @Post(':id/portal-password')
  @Permissions(buildPermissionKey('Customer', 'update'))
  setPortalPassword(@Param('id') id: string, @Body() dto: SetCustomerPortalAccessDto) {
    return this.service.setPortalPassword(id, dto.password);
  }

  @Patch(':id/portal-access')
  @Permissions(buildPermissionKey('Customer', 'update'))
  setPortalEnabled(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.service.setPortalEnabled(id, Boolean(body?.enabled));
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Customer', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
