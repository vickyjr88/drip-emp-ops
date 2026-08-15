import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../common/next-reference';

const ROUNDING_TOLERANCE = 0.01;

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Employees -------------------------------------------------------

  private async nextEmployeeNumber() {
    return nextReference(this.prisma.employee, 'employeeNumber', 'EMP', new Date().getFullYear(), 4);
  }

  async createEmployee(data: any) {
    if (data.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
      if (!user) throw new NotFoundException(`User ${data.userId} not found`);
      const taken = await this.prisma.employee.findUnique({ where: { userId: data.userId } });
      if (taken) throw new BadRequestException('That portal account is already linked to another employee.');
    }

    return this.prisma.employee.create({
      data: {
        ...data,
        employeeNumber: data.employeeNumber?.trim() || (await this.nextEmployeeNumber()),
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
  }

  findEmployees(params: {
    search?: string;
    status?: string;
    department?: string;
    storeId?: string;
    payType?: string;
  } = {}) {
    const where: Prisma.EmployeeWhereInput = {
      ...(params.status ? { status: params.status as any } : {}),
      ...(params.department ? { department: params.department } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.payType ? { payType: params.payType as any } : {}),
      ...(params.search
        ? {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { employeeNumber: { contains: params.search, mode: 'insensitive' } },
              { jobTitle: { contains: params.search, mode: 'insensitive' } },
              { department: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.employee.findMany({
      where,
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        leaveBalances: { include: { leaveType: true }, orderBy: { year: 'desc' } },
        leaveRequests: {
          include: { leaveType: true },
          orderBy: { startDate: 'desc' },
          // Was a hard 50 with no way to ask for more, so an employee with a
          // long history simply lost the older requests -- the list showed a
          // first page that could not be paged past. 500 covers a full career
          // of requests while still bounding the payload.
          take: 500,
        },
      },
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async updateEmployee(id: string, data: any) {
    await this.findEmployeeOrThrow(id);
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...data,
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
      },
    });
  }

  private async findEmployeeOrThrow(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async removeEmployee(id: string) {
    const requests = await this.prisma.leaveRequest.count({ where: { employeeId: id } });
    if (requests > 0) {
      throw new BadRequestException(
        'This employee has leave history and cannot be deleted. Mark them terminated instead.',
      );
    }
    return this.prisma.employee.delete({ where: { id } });
  }

  /** Headline numbers for the staff list. */
  async employeeStats() {
    const [byStatus, byPayType, total] = await Promise.all([
      this.prisma.employee.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.employee.groupBy({ by: ['payType'], _count: { _all: true } }),
      this.prisma.employee.count(),
    ]);

    const monthlyCost = await this.prisma.employee.aggregate({
      where: { status: 'ACTIVE', payType: 'MONTHLY' },
      _sum: { payRate: true },
    });

    return {
      total,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      byPayType: byPayType.map((row) => ({ payType: row.payType, count: row._count._all })),
      // Daily-rated staff vary with days worked, so only salaried cost is a
      // meaningful recurring figure.
      monthlySalaryCost: round2(Number(monthlyCost._sum.payRate || 0)),
    };
  }

  // --- Leave types -----------------------------------------------------

  createLeaveType(data: any) {
    return this.prisma.leaveType.create({ data });
  }

  findLeaveTypes(activeOnly = false) {
    return this.prisma.leaveType.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async updateLeaveType(id: string, data: any) {
    const type = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException(`Leave type ${id} not found`);
    return this.prisma.leaveType.update({ where: { id }, data });
  }

  // --- Balances --------------------------------------------------------

  /**
   * Days someone is entitled to in a year, pro-rated when they start part way
   * through it.
   *
   * Someone joining in July gets roughly half the annual allowance. The
   * calculation is by whole months remaining, which is easier to explain to
   * staff than a day count and is what most handbooks describe.
   */
  private proRatedEntitlement(annualDays: number, startDate: Date, year: number) {
    const start = startOfDay(startDate);
    if (start.getUTCFullYear() < year) return annualDays;
    if (start.getUTCFullYear() > year) return 0;

    const monthsRemaining = 12 - start.getUTCMonth();
    return round2((annualDays * monthsRemaining) / 12);
  }

  /**
   * Opens balances for a year, creating any that are missing.
   *
   * Existing balances are left alone: entitlement is fixed when the year opens,
   * so recomputing it later would rewrite a figure people have already been
   * told and may have booked against.
   */
  async openBalances(year: number, employeeId?: string) {
    const [employees, leaveTypes] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          status: { not: 'TERMINATED' },
          ...(employeeId ? { id: employeeId } : {}),
        },
      }),
      this.prisma.leaveType.findMany({ where: { isActive: true } }),
    ]);

    let created = 0;
    for (const employee of employees) {
      // Someone who left before the year started has no entitlement in it.
      if (employee.startDate.getUTCFullYear() > year) continue;

      for (const leaveType of leaveTypes) {
        if (employee.contractType === 'CASUAL' && !leaveType.accruesForCasual) continue;

        const existing = await this.prisma.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year },
          },
        });
        if (existing) continue;

        // Carry-over comes from last year's remaining days, capped if the type
        // sets a maximum.
        let broughtForward = 0;
        if (leaveType.carriesOver) {
          const previous = await this.prisma.leaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: employee.id,
                leaveTypeId: leaveType.id,
                year: year - 1,
              },
            },
          });
          if (previous) {
            const remaining =
              Number(previous.entitledDays) +
              Number(previous.broughtForward) +
              Number(previous.adjustmentDays) -
              Number(previous.takenDays);
            broughtForward = Math.max(0, remaining);
            if (leaveType.maxCarryOver !== null && leaveType.maxCarryOver !== undefined) {
              broughtForward = Math.min(broughtForward, Number(leaveType.maxCarryOver));
            }
          }
        }

        await this.prisma.leaveBalance.create({
          data: {
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            year,
            entitledDays: this.proRatedEntitlement(Number(leaveType.annualDays), employee.startDate, year),
            broughtForward: round2(broughtForward),
          },
        });
        created += 1;
      }
    }

    return { year, balancesCreated: created };
  }

  async findBalances(params: { employeeId?: string; year?: number } = {}) {
    const year = params.year ?? new Date().getUTCFullYear();
    const balances = await this.prisma.leaveBalance.findMany({
      where: { year, ...(params.employeeId ? { employeeId: params.employeeId } : {}) },
      include: {
        leaveType: true,
        employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
      },
      orderBy: [{ employee: { firstName: 'asc' } }, { leaveType: { name: 'asc' } }],
    });

    return balances.map((balance) => ({
      ...balance,
      available: round2(
        Number(balance.entitledDays) +
          Number(balance.broughtForward) +
          Number(balance.adjustmentDays) -
          Number(balance.takenDays),
      ),
    }));
  }

  async adjustBalance(id: string, days: number, note: string) {
    const balance = await this.prisma.leaveBalance.findUnique({ where: { id } });
    if (!balance) throw new NotFoundException(`Leave balance ${id} not found`);
    if (!note?.trim()) {
      // An unexplained adjustment is indistinguishable from an error later.
      throw new BadRequestException('An adjustment needs a reason.');
    }
    return this.prisma.leaveBalance.update({
      where: { id },
      data: { adjustmentDays: round2(Number(balance.adjustmentDays) + days), adjustmentNote: note.trim() },
    });
  }

  // --- Requests --------------------------------------------------------

  /** Working days between two dates, weekends excluded. */
  countWorkingDays(start: Date, end: Date) {
    let days = 0;
    const cursor = startOfDay(start);
    const last = startOfDay(end);
    while (cursor <= last) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) days += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }

  async createLeaveRequest(data: {
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason?: string;
    createdBy?: string;
  }) {
    const employee = await this.findEmployeeOrThrow(data.employeeId);
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: data.leaveTypeId } });
    if (!leaveType) throw new NotFoundException(`Leave type ${data.leaveTypeId} not found`);

    const start = startOfDay(new Date(data.startDate));
    const end = startOfDay(new Date(data.endDate));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Start and end dates are required.');
    }
    if (end < start) throw new BadRequestException('The end date cannot be before the start date.');
    if (start < startOfDay(employee.startDate)) {
      throw new BadRequestException('Leave cannot start before the employee joined.');
    }

    const days = this.countWorkingDays(start, end);
    if (days === 0) {
      throw new BadRequestException('That range contains no working days.');
    }

    // Overlapping requests would double-count against the balance.
    const clash = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: data.employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (clash) {
      throw new BadRequestException('This overlaps leave already requested or approved for this employee.');
    }

    const year = start.getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId: data.employeeId, leaveTypeId: data.leaveTypeId, year },
      },
    });
    if (!balance) {
      throw new BadRequestException(
        `No ${leaveType.name} balance exists for ${year}. Open balances for that year first.`,
      );
    }

    const available =
      Number(balance.entitledDays) +
      Number(balance.broughtForward) +
      Number(balance.adjustmentDays) -
      Number(balance.takenDays);
    if (days > available + ROUNDING_TOLERANCE) {
      throw new BadRequestException(
        `Only ${round2(available)} days of ${leaveType.name} remain; this request is ${days} days.`,
      );
    }

    return this.prisma.leaveRequest.create({
      data: {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: start,
        endDate: end,
        days,
        reason: data.reason,
        createdBy: data.createdBy || 'system',
      },
      include: { employee: true, leaveType: true },
    });
  }

  findLeaveRequests(params: { employeeId?: string; status?: string; from?: string; to?: string } = {}) {
    return this.prisma.leaveRequest.findMany({
      where: {
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
        ...(params.status ? { status: params.status as any } : {}),
        ...(params.from || params.to
          ? {
              startDate: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(`${params.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, department: true } },
        leaveType: { select: { id: true, name: true, code: true, isPaid: true } },
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    });
  }

  /**
   * Approving consumes the balance in the same transaction as the decision, so
   * an approved request and the days it used can never disagree.
   */
  async reviewLeaveRequest(id: string, status: 'APPROVED' | 'REJECTED', reviewedBy?: string, note?: string) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { leaveType: true },
    });
    if (!request) throw new NotFoundException(`Leave request ${id} not found`);
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`This request has already been ${request.status.toLowerCase()}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (status === 'APPROVED') {
        const year = request.startDate.getUTCFullYear();
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
            },
          },
        });
        if (!balance) {
          throw new BadRequestException(`No ${request.leaveType.name} balance exists for ${year}.`);
        }

        // Re-checked at approval: other requests may have been approved since
        // this one was raised.
        const available =
          Number(balance.entitledDays) +
          Number(balance.broughtForward) +
          Number(balance.adjustmentDays) -
          Number(balance.takenDays);
        if (Number(request.days) > available + ROUNDING_TOLERANCE) {
          throw new BadRequestException(
            `Only ${round2(available)} days remain; this request is ${request.days} days.`,
          );
        }

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { takenDays: round2(Number(balance.takenDays) + Number(request.days)) },
        });
      }

      return tx.leaveRequest.update({
        where: { id },
        data: {
          status,
          reviewedBy: reviewedBy || 'system',
          reviewedAt: new Date(),
          reviewNote: note?.trim() || null,
        },
        include: { employee: true, leaveType: true },
      });
    });
  }

  /** Cancelling an approved request returns the days to the balance. */
  async cancelLeaveRequest(id: string, cancelledBy?: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Leave request ${id} not found`);
    if (request.status === 'CANCELLED') {
      throw new BadRequestException('This request is already cancelled.');
    }
    if (request.status === 'REJECTED') {
      throw new BadRequestException('A rejected request cannot be cancelled.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.status === 'APPROVED') {
        const year = request.startDate.getUTCFullYear();
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
            },
          },
        });
        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { takenDays: round2(Math.max(0, Number(balance.takenDays) - Number(request.days))) },
          });
        }
      }

      return tx.leaveRequest.update({
        where: { id },
        data: { status: 'CANCELLED', reviewedBy: cancelledBy || 'system', reviewedAt: new Date() },
      });
    });
  }

  /** Who is off between two dates, for the calendar view. */
  async leaveCalendar(from: string, to: string) {
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: new Date(`${to.slice(0, 10)}T23:59:59.999Z`) },
        endDate: { gte: new Date(from) },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true } },
        leaveType: { select: { name: true, code: true, isPaid: true } },
      },
      orderBy: { startDate: 'asc' },
    });
    return requests;
  }
}
