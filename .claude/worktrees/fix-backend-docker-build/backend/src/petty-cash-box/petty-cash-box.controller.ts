import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { PettyCashBoxService } from './petty-cash-box.service';
import { CreatePettyCashBoxDto } from './dto/create-petty-cash-box.dto';
import { UpdatePettyCashBoxDto } from './dto/update-petty-cash-box.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('petty-cash-boxes')
@Controller('petty-cash-boxes')
export class PettyCashBoxController {
  constructor(private readonly service: PettyCashBoxService) {}

  @Post()
  @Permissions(buildPermissionKey('PettyCashBox', 'create'))
  create(@Body() dto: CreatePettyCashBoxDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('PettyCashBox', 'read'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Permissions(buildPermissionKey('PettyCashBox', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/balance')
  @Permissions(buildPermissionKey('PettyCashBox', 'read'))
  balance(@Param('id') id: string) {
    return this.service.currentBalance(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('PettyCashBox', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdatePettyCashBoxDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('PettyCashBox', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
