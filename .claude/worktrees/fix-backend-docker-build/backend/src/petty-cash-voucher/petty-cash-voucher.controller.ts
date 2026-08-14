import { Controller, Get, Post, Body, Param, Query, StreamableFile } from '@nestjs/common';
import { PettyCashVoucherService } from './petty-cash-voucher.service';
import { CreatePettyCashVoucherDto } from './dto/create-petty-cash-voucher.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('petty-cash-vouchers')
@Controller('petty-cash-vouchers')
export class PettyCashVoucherController {
  constructor(private readonly service: PettyCashVoucherService) {}

  @Post()
  @Permissions(buildPermissionKey('PettyCashVoucher', 'create'))
  create(@Body() dto: CreatePettyCashVoucherDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('PettyCashVoucher', 'read'))
  findAll(@Query('boxId') boxId?: string, @Query('type') type?: string) {
    return this.service.findAll({ boxId, type });
  }

  @Get(':id')
  @Permissions(buildPermissionKey('PettyCashVoucher', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/print')
  @Permissions(buildPermissionKey('PettyCashVoucher', 'update'))
  print(@Param('id') id: string) {
    return this.service.print(id);
  }

  @Get(':id/pdf')
  @Permissions(buildPermissionKey('PettyCashVoucher', 'read'))
  async downloadPdf(@Param('id') id: string) {
    const voucher = await this.service.findOne(id);
    const pdf = await this.service.pdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="voucher-${voucher.voucherNumber}.pdf"`,
    });
  }

  @Post(':id/void')
  @Permissions(buildPermissionKey('PettyCashVoucher', 'update'))
  void_(@Param('id') id: string) {
    return this.service.void(id);
  }
}
