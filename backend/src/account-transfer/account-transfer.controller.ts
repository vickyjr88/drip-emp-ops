import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';
import { CreateAccountTransferDto } from './dto/create-account-transfer.dto';
import { AccountTransferQueryDto } from './dto/account-transfer-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('account-transfers')
@Controller('account-transfers')
export class AccountTransferController {
  constructor(private readonly service: AccountTransferService) {}

  @Post()
  @Permissions(buildPermissionKey('AccountTransfer', 'create'))
  create(@Body() dto: CreateAccountTransferDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('AccountTransfer', 'read'))
  findAll(@Query() query: AccountTransferQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('AccountTransfer', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
