import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { BankAccountService } from './bank-account.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('bank-accounts')
@Controller('bank-accounts')
export class BankAccountController {
  constructor(private readonly service: BankAccountService) {}

  @Post()
  @Permissions(buildPermissionKey('BankAccount', 'create'))
  create(@Body() dto: CreateBankAccountDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('BankAccount', 'read'))
  findAll(@Query('projectId') projectId?: string) {
    return this.service.findAll(projectId);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('BankAccount', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/balance')
  @Permissions(buildPermissionKey('BankAccount', 'read'))
  balance(@Param('id') id: string) {
    return this.service.balance(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('BankAccount', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('BankAccount', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
