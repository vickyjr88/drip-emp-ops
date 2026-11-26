import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { SalesReportService } from './sales-report.service';
import { SalesReportQueryDto } from './sales-report.dto';

/** Reading orders is the right to see the report; profit also needs the right to see the books, as it does on Analytics. */
@ApiBearerAuth()
@ApiTags('sales-report')
@Controller('sales-report')
export class SalesReportController {
  constructor(private readonly service: SalesReportService) {}

  @Get()
  @Permissions(buildPermissionKey('Order', 'read'))
  report(@Query() query: SalesReportQueryDto, @Req() request: any) {
    const withMargin = (request?.user?.permissions ?? []).includes(buildPermissionKey('JournalEntry', 'read'));
    return this.service.report(query, { withMargin });
  }

  @Get('orders')
  @Permissions(buildPermissionKey('Order', 'read'))
  orders(@Query() query: SalesReportQueryDto) {
    return this.service.list(query);
  }

  @Get('export')
  @Permissions(buildPermissionKey('Order', 'read'))
  export(@Query() query: SalesReportQueryDto) {
    return this.service.exportRows(query);
  }

  @Get('options')
  @Permissions(buildPermissionKey('Order', 'read'))
  options() {
    return this.service.options();
  }
}
