import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { ResellerService } from './reseller.service';
import { CreateResellerDto, UpdateResellerDto } from './dto/reseller.dto';

@ApiBearerAuth()
@ApiTags('resellers')
@Controller('resellers')
export class ResellerController {
  constructor(private readonly service: ResellerService) {}

  @Post()
  @Permissions(buildPermissionKey('Reseller', 'create'))
  create(@Body() dto: CreateResellerDto) { return this.service.create(dto); }

  @Get()
  @Permissions(buildPermissionKey('Reseller', 'read'))
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Reseller', 'read'))
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Permissions(buildPermissionKey('Reseller', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateResellerDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Permissions(buildPermissionKey('Reseller', 'delete'))
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
