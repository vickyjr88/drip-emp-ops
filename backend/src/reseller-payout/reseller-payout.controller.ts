import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ResellerPayoutService } from './reseller-payout.service';
import { CreateResellerPayoutDto } from './dto/create-reseller-payout.dto';
import { ResellerPayoutQueryDto } from './dto/reseller-payout-query.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('reseller-payouts')
@Controller('reseller-payouts')
export class ResellerPayoutController {
  constructor(private readonly service: ResellerPayoutService) {}

  @Post()
  @Permissions(buildPermissionKey('ResellerPayout', 'create'))
  stage(@Body() dto: CreateResellerPayoutDto) {
    return this.service.stage(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('ResellerPayout', 'read'))
  findAll(@Query() query: ResellerPayoutQueryDto) {
    return this.service.findAll(query);
  }

  @Get('stats')
  @Permissions(buildPermissionKey('ResellerPayout', 'read'))
  stats() {
    return this.service.stats();
  }

  @Get(':id')
  @Permissions(buildPermissionKey('ResellerPayout', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/approve')
  @Permissions(buildPermissionKey('ResellerPayout', 'update'))
  approve(@Param('id') id: string, @Body('approvedBy') approvedBy?: string) {
    return this.service.approve(id, approvedBy || 'system');
  }

  @Post(':id/release')
  @Permissions(buildPermissionKey('ResellerPayout', 'update'))
  release(@Param('id') id: string) {
    return this.service.release(id);
  }

  @Post(':id/cancel')
  @Permissions(buildPermissionKey('ResellerPayout', 'update'))
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
