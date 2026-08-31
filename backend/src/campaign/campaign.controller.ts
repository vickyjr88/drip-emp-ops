import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { Public } from '../auth/decorators/public.decorator';

@ApiBearerAuth()
@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Post()
  @Permissions(buildPermissionKey('MarketingCampaign', 'create'))
  create(@Body() dto: CreateCampaignDto, @Req() request: any) {
    return this.service.create(dto, request.user?.email);
  }

  @Get()
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  findAll(@Query() query: CampaignQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/performance')
  @Permissions(buildPermissionKey('MarketingCampaign', 'read'))
  performance(@Param('id') id: string) {
    return this.service.performance(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('MarketingCampaign', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('MarketingCampaign', 'update'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /**
   * A landing on a shared campaign link -- no auth, since the visitor is
   * near-always a stranger arriving from an ad who has never signed in.
   * Mirrors CustomerPortalController.recordReferralClick's shape.
   */
  @Public()
  @Post(':code/click')
  recordClick(@Param('code') code: string) {
    return this.service.recordClick(code);
  }
}
