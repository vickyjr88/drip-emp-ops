import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { CreateDeductionRuleDto, CreatePayrollRunDto } from './dto/payroll.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('payroll')
@Controller()
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  // --- Deduction rules ---

  @Post('deduction-rules')
  @Permissions(buildPermissionKey('DeductionRule', 'create'))
  createRule(@Body() dto: CreateDeductionRuleDto, @Req() request: any) {
    return this.service.createRule({ ...dto, createdBy: request?.user?.email });
  }

  @Get('deduction-rules')
  @Permissions(buildPermissionKey('DeductionRule', 'read'))
  findRules(@Query('code') code?: string, @Query('activeOnly') activeOnly?: string) {
    return this.service.findRules({ code, activeOnly: activeOnly === 'true' });
  }

  // Declared before :id so these literal paths are not read as rule ids.
  @Get('deduction-rules/in-force')
  @Permissions(buildPermissionKey('DeductionRule', 'read'))
  inForce(@Query('on') on?: string) {
    return this.service.rulesInForce(on ? new Date(on) : new Date());
  }

  @Get('deduction-rules/preview')
  @Permissions(buildPermissionKey('DeductionRule', 'read'))
  preview(@Query('grossPay') grossPay: string, @Query('on') on?: string) {
    return this.service.previewCalculation(Number(grossPay), on);
  }

  @Patch('deduction-rules/:id')
  @Permissions(buildPermissionKey('DeductionRule', 'update'))
  updateRule(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateRule(id, dto);
  }

  // --- Payroll runs ---

  @Post('payroll-runs')
  @Permissions(buildPermissionKey('PayrollRun', 'create'))
  createRun(@Body() dto: CreatePayrollRunDto, @Req() request: any) {
    return this.service.createRun({ ...dto, createdBy: request?.user?.email });
  }

  @Get('payroll-runs')
  @Permissions(buildPermissionKey('PayrollRun', 'read'))
  findRuns(@Query('status') status?: string) {
    return this.service.findRuns({ status });
  }

  @Get('payroll-runs/:id')
  @Permissions(buildPermissionKey('PayrollRun', 'read'))
  findRun(@Param('id') id: string) {
    return this.service.findRun(id);
  }

  @Get('payroll-runs/:id/summary')
  @Permissions(buildPermissionKey('PayrollRun', 'read'))
  summary(@Param('id') id: string) {
    return this.service.runSummary(id);
  }

  @Patch('payroll-runs/:id/approve')
  @Permissions(buildPermissionKey('PayrollRun', 'update'))
  approve(@Param('id') id: string, @Req() request: any) {
    return this.service.approveRun(id, request?.user?.email);
  }

  @Patch('payroll-runs/:id/paid')
  @Permissions(buildPermissionKey('PayrollRun', 'update'))
  markPaid(@Param('id') id: string) {
    return this.service.markPaid(id);
  }

  @Delete('payroll-runs/:id')
  @Permissions(buildPermissionKey('PayrollRun', 'delete'))
  cancel(@Param('id') id: string, @Req() request: any) {
    return this.service.cancelRun(id, request?.user?.email);
  }
}
