import { Controller, Get, Post, Body, Param, Query, StreamableFile } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { AllocateReceiptDto, CancelReceiptDto, CreateReceiptDto } from './dto/create-receipt.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('receipts')
@Controller('receipts')
export class ReceiptController {
  constructor(private readonly service: ReceiptService) {}

  @Post()
  @Permissions(buildPermissionKey('Receipt', 'create'))
  create(@Body() dto: CreateReceiptDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Receipt', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      customerId,
      status,
    });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Receipt', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  @Permissions(buildPermissionKey('Receipt', 'read'))
  async downloadPdf(@Param('id') id: string) {
    const receipt = await this.service.findOne(id);
    const pdf = await this.service.pdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="receipt-${receipt.receiptNumber}.pdf"`,
    });
  }

  @Post(':id/allocate')
  @Permissions(buildPermissionKey('Receipt', 'update'))
  allocate(@Param('id') id: string, @Body() dto: AllocateReceiptDto) {
    return this.service.allocate(id, dto);
  }

  @Post(':id/reprint')
  @Permissions(buildPermissionKey('Receipt', 'update'))
  reprint(@Param('id') id: string) {
    return this.service.reprint(id);
  }

  @Post(':id/cancel')
  @Permissions(buildPermissionKey('Receipt', 'update'))
  cancel(@Param('id') id: string, @Body() dto: CancelReceiptDto) {
    return this.service.cancel(id, dto);
  }
}
