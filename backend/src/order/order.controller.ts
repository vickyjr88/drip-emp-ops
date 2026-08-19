import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { OrderService } from './order.service';
import { CreateOrderDto, RecordOrderPaymentDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @Permissions(buildPermissionKey('Order', 'create'))
  create(@Body() dto: CreateOrderDto, @Req() request: any) {
    return this.service.create(dto, request?.user?.email || 'system');
  }

  @Get()
  @Permissions(buildPermissionKey('Order', 'read'))
  findAll(@Query() query: OrderQueryDto) {
    return this.service.findAll(query);
  }

  // Before ':id', or "summary" is read as an order id.
  @Get('summary')
  @Permissions(buildPermissionKey('Order', 'read'))
  summary(
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.salesSummary({ storeId, from, to });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Order', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/status')
  @Permissions(buildPermissionKey('Order', 'update'))
  setStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.service.setStatus(id, dto.status, dto.notes);
  }

  @Post(':id/payments')
  @Permissions(buildPermissionKey('OrderPayment', 'create'))
  recordPayment(@Param('id') id: string, @Body() dto: RecordOrderPaymentDto, @Req() request: any) {
    return this.service.recordPayment(id, dto, request?.user?.email || 'system');
  }
}
