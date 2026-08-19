import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HrService } from './hr.service';
import {
  AdjustBalanceDto,
  CreateEmployeeDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  OpenBalancesDto,
  ReviewLeaveRequestDto,
  UpdateEmployeeDto,
} from './dto/hr.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('hr')
@Controller()
export class HrController {
  constructor(private readonly service: HrService) {}

  // --- Employees ---

  @Post('employees')
  @Permissions(buildPermissionKey('Employee', 'create'))
  createEmployee(@Body() dto: CreateEmployeeDto, @Req() request: any) {
    return this.service.createEmployee({ ...dto, createdBy: request?.user?.email });
  }

  @Get('employees')
  @Permissions(buildPermissionKey('Employee', 'read'))
  findEmployees(@Query() query: EmployeeQueryDto) {
    return this.service.findEmployees(query);
  }

  // Declared before :id so the literal path is not read as an employee id.
  @Get('employees/stats')
  @Permissions(buildPermissionKey('Employee', 'read'))
  employeeStats() {
    return this.service.employeeStats();
  }

  @Get('employees/:id')
  @Permissions(buildPermissionKey('Employee', 'read'))
  findEmployee(@Param('id') id: string) {
    return this.service.findEmployee(id);
  }

  @Patch('employees/:id')
  @Permissions(buildPermissionKey('Employee', 'update'))
  updateEmployee(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.updateEmployee(id, dto);
  }

  @Delete('employees/:id')
  @Permissions(buildPermissionKey('Employee', 'delete'))
  removeEmployee(@Param('id') id: string) {
    return this.service.removeEmployee(id);
  }

  // --- Leave types ---

  @Post('leave-types')
  @Permissions(buildPermissionKey('LeaveType', 'create'))
  createLeaveType(@Body() dto: CreateLeaveTypeDto) {
    return this.service.createLeaveType(dto);
  }

  @Get('leave-types')
  @Permissions(buildPermissionKey('LeaveType', 'read'))
  findLeaveTypes(@Query('activeOnly') activeOnly?: string) {
    return this.service.findLeaveTypes(activeOnly === 'true');
  }

  @Patch('leave-types/:id')
  @Permissions(buildPermissionKey('LeaveType', 'update'))
  updateLeaveType(@Param('id') id: string, @Body() dto: CreateLeaveTypeDto) {
    return this.service.updateLeaveType(id, dto);
  }

  // --- Balances ---

  @Post('leave-balances/open')
  @Permissions(buildPermissionKey('LeaveBalance', 'create'))
  openBalances(@Body() dto: OpenBalancesDto) {
    return this.service.openBalances(dto.year, dto.employeeId);
  }

  @Get('leave-balances')
  @Permissions(buildPermissionKey('LeaveBalance', 'read'))
  findBalances(@Query('employeeId') employeeId?: string, @Query('year') year?: string) {
    return this.service.findBalances({ employeeId, year: year ? Number(year) : undefined });
  }

  @Patch('leave-balances/:id/adjust')
  @Permissions(buildPermissionKey('LeaveBalance', 'update'))
  adjustBalance(@Param('id') id: string, @Body() dto: AdjustBalanceDto) {
    return this.service.adjustBalance(id, dto.days, dto.note);
  }

  // --- Requests ---

  @Post('leave-requests')
  @Permissions(buildPermissionKey('LeaveRequest', 'create'))
  createRequest(@Body() dto: CreateLeaveRequestDto, @Req() request: any) {
    return this.service.createLeaveRequest({ ...dto, createdBy: request?.user?.email });
  }

  @Get('leave-requests')
  @Permissions(buildPermissionKey('LeaveRequest', 'read'))
  findRequests(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findLeaveRequests({ employeeId, status, from, to });
  }

  @Get('leave-requests/calendar')
  @Permissions(buildPermissionKey('LeaveRequest', 'read'))
  calendar(@Query('from') from: string, @Query('to') to: string) {
    return this.service.leaveCalendar(from, to);
  }

  @Patch('leave-requests/:id/review')
  @Permissions(buildPermissionKey('LeaveRequest', 'update'))
  review(@Param('id') id: string, @Body() dto: ReviewLeaveRequestDto, @Req() request: any) {
    return this.service.reviewLeaveRequest(id, dto.status, request?.user?.email, dto.reviewNote);
  }

  @Patch('leave-requests/:id/cancel')
  @Permissions(buildPermissionKey('LeaveRequest', 'update'))
  cancel(@Param('id') id: string, @Req() request: any) {
    return this.service.cancelLeaveRequest(id, request?.user?.email);
  }
}
