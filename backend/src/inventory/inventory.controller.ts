import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { InventoryService } from './inventory.service';
import { RecordMovementDto, SetReorderLevelDto } from './dto/stock.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';

@ApiBearerAuth()
@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('levels')
  @Permissions(buildPermissionKey('StockLevel', 'read'))
  levels(
    @Query('storeId') storeId?: string,
    @Query('variantId') variantId?: string,
    @Query('lowOnly') lowOnly?: string,
  ) {
    return this.service.levels({ storeId, variantId, lowOnly });
  }

  @Get('movements')
  @Permissions(buildPermissionKey('StockMovement', 'read'))
  movements(@Query() query: StockMovementQueryDto) {
    return this.service.movements(query);
  }

  @Post('movements')
  @Permissions(buildPermissionKey('StockMovement', 'create'))
  record(@Body() dto: RecordMovementDto, @Req() request: any) {
    return this.service.record(dto, request?.user?.email || 'system');
  }

  @Patch('levels/:variantId/:storeId/reorder')
  @Permissions(buildPermissionKey('StockLevel', 'update'))
  setReorder(
    @Param('variantId') variantId: string,
    @Param('storeId') storeId: string,
    @Body() dto: SetReorderLevelDto,
  ) {
    return this.service.setReorderLevel(variantId, storeId, dto.reorderAt);
  }
}
