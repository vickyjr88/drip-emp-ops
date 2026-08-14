import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';
import { CreateAccountTransferDto } from './dto/create-account-transfer.dto';
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
  findAll(@Query('skip') skip?: string, @Query('take') take?: string, @Query('accountId') accountId?: string) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      accountId,
    });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('AccountTransfer', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
