import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomerDocumentService } from './customer-document.service';
import { CreateCustomerDocumentDto } from './dto/create-customer-document.dto';
import { UpdateCustomerDocumentDto } from './dto/update-customer-document.dto';
import { CustomerDocumentQueryDto } from './dto/customer-document-query.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('customer-documents')
@Controller('customer-documents')
export class CustomerDocumentController {
  constructor(private readonly service: CustomerDocumentService) {}

  @Post()
  @Permissions(buildPermissionKey('CustomerDocument', 'create'))
  create(@Body() dto: CreateCustomerDocumentDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('CustomerDocument', 'read'))
  findAll(@Query() query: CustomerDocumentQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('CustomerDocument', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('CustomerDocument', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDocumentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('CustomerDocument', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
