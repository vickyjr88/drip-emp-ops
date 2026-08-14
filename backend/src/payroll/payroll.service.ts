import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { Rule, calculatePayslip } from './payroll-calculator';

const SALARY_EXPENSE = '5210';
const CASH = '1000';

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  // --- Deduction rules -------------------------------------------------

  /**
   * The rules in force on a date.
   *
   * Each code may have several versions; the one selected is the latest whose
   * effectiveFrom is on or before the date and which has not been superseded.
   * Resolving by date is what lets a Finance Act change be configured ahead of
   * time and keeps a re-run of an old period reproducible.
   */
  async rulesInForce(on: Date): Promise<Rule[]> {
    const candidates = await this.prisma.deductionRule.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: on },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: on } }],
      },
      include: { bands: { orderBy: { sequence: 'asc' } } },
      orderBy: { effectiveFrom: 'desc' },
    });

    const latestByCode = new Map<string, (typeof candidates)[number]>();
    for (const rule of candidates) {
      if (!latestByCode.has(rule.code)) latestByCode.set(rule.code, rule);
    }

    return [...latestByCode.values()].map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      kind: rule.kind,
      basis: rule.basis,
      rate: rule.rate === null ? null : Number(rule.rate),
      fixedAmount: rule.fixedAmount === null ? null : Number(rule.fixedAmount),
      reliefAmount: rule.reliefAmount === null ? null : Number(rule.reliefAmount),
      employerRate: rule.employerRate === null ? null : Number(rule.employerRate),
      employerFixed: rule.employerFixed === null ? null : Number(rule.employerFixed),
      reducesTaxable: rule.reducesTaxable,
      liabilityAccountCode: rule.liabilityAccountCode,
      employerExpenseAccountCode: rule.employerExpenseAccountCode,
      bands: rule.bands.map((band) => ({
        sequence: band.sequence,
        lowerBound: Number(band.lowerBound),
        upperBound: band.upperBound === null ? null : Number(band.upperBound),
        rate: Number(band.rate),
        maxAmount: band.maxAmount === null ? null : Number(band.maxAmount),
      })),
    }));
  }

  findRules(params: { code?: string; activeOnly?: boolean } = {}) {
    return this.prisma.deductionRule.findMany({
      where: {
        ...(params.code ? { code: params.code } : {}),
        ...(params.activeOnly ? { isActive: true } : {}),
      },
      include: { bands: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async createRule(data: any) {
    const { bands = [], ...rule } = data;
    if (['GRADUATED', 'TIERED'].includes(rule.kind) && bands.length === 0) {
      throw new BadRequestException(`A ${rule.kind} deduction needs at least one band.`);
    }
    if (rule.kind === 'PERCENTAGE' && (rule.rate === undefined || rule.rate === null)) {
      throw new BadRequestException('A percentage deduction needs a rate.');
    }
    if (rule.kind === 'FIXED' && (rule.fixedAmount === undefined || rule.fixedAmount === null)) {
      throw new BadRequestException('A fixed deduction needs an amount.');
    }

    // The account must exist, or the run would fail at posting time with the
    // payslips already calculated.
    await this.ledger.getAccountByCode(rule.liabilityAccountCode);
    if (rule.employerExpenseAccountCode) {
      await this.ledger.getAccountByCode(rule.employerExpenseAccountCode);
    }

    try {
      return await this.prisma.deductionRule.create({
      data: {
        ...rule,
        effectiveFrom: new Date(rule.effectiveFrom),
        effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : null,
        bands: {
          create: bands.map((band: any, index: number) => ({
            sequence: band.sequence ?? index + 1,
            lowerBound: band.lowerBound ?? 0,
            upperBound: band.upperBound ?? null,
            rate: band.rate,
            maxAmount: band.maxAmount ?? null,
          })),
        },
      },
      include: { bands: { orderBy: { sequence: 'asc' } } },
      });
    } catch (error) {
      // One version per code per date: a clash means the caller meant to edit
      // the existing version or pick a different date.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(
          `A version of ${rule.code} already starts on ${String(rule.effectiveFrom).slice(0, 10)}. Choose a different effective date.`,
        );
      }
      throw error;
    }
  }

  async updateRule(id: string, data: any) {
    const existing = await this.prisma.deductionRule.findUnique({ where: { id }, include: { lines: true } });
    if (!existing) throw new NotFoundException(`Deduction rule ${id} not found`);
    if (existing.lines.length > 0) {
      throw new BadRequestException(
        'This rule has already been used on payslips. Add a new version with a later effective date instead of editing it, so past payslips stay reproducible.',
      );
    }

    const { bands, ...rule } = data;
    return this.prisma.$transaction(async (tx) => {
      if (bands) {
        await tx.deductionBand.deleteMany({ where: { ruleId: id } });
        for (const [index, band] of bands.entries()) {
          await tx.deductionBand.create({
            data: {
              ruleId: id,
              sequence: band.sequence ?? index + 1,
              lowerBound: band.lowerBound ?? 0,
              upperBound: band.upperBound ?? null,
              rate: band.rate,
              maxAmount: band.maxAmount ?? null,
            },
          });
        }
      }
      return tx.deductionRule.update({
        where: { id },
        data: {
          ...rule,
          ...(rule.effectiveFrom ? { effectiveFrom: new Date(rule.effectiveFrom) } : {}),
          ...(rule.effectiveTo !== undefined
            ? { effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : null }
            : {}),
        },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  /** What a given gross would produce, for checking a rule before using it. */
  async previewCalculation(grossPay: number, on?: string) {
    const date = on ? new Date(on) : new Date();
    const rules = await this.rulesInForce(date);
    const result = calculatePayslip(
      { basicPay: grossPay, allowances: 0, overtime: 0, bonus: 0 },
      rules,
    );
    return { on: date.toISOString().slice(0, 10), rulesApplied: rules.length, ...result };
  }

  // --- Payroll runs ----------------------------------------------------

  private async nextRunNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.payrollRun.count({
      where: { runNumber: { startsWith: `PR-${year}-` } },
    });
    return `PR-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * Builds a draft run for a month.
   *
   * Nothing is posted here: a draft can be reviewed, deleted and rebuilt.
   * Amounts are only committed to the ledger when the run is approved.
   */
  async createRun(input: {
    periodMonth: string;
    employeeIds?: string[];
    entries?: Array<{ employeeId: string; allowances?: number; overtime?: number; bonus?: number; daysWorked?: number }>;
    notes?: string;
    createdBy?: string;
  }) {
    const month = new Date(`${input.periodMonth.slice(0, 7)}-01T00:00:00.000Z`);
    if (Number.isNaN(month.getTime())) {
      throw new BadRequestException('periodMonth must look like 2026-08.');
    }

    const existing = await this.prisma.payrollRun.findFirst({
      where: { periodMonth: month, status: { not: 'CANCELLED' } },
    });
    if (existing) {
      throw new BadRequestException(
        `A payroll run already exists for that month (${existing.runNumber}). Cancel it before creating another.`,
      );
    }

    // Rules are resolved against the last day of the month being paid, so a
    // mid-month rate change applies to the period it belongs to.
    const ruleDate = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
    const rules = await this.rulesInForce(ruleDate);
    if (rules.length === 0) {
      throw new BadRequestException(
        'No deduction rules are in force for that month. Configure them before running payroll.',
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        ...(input.employeeIds?.length ? { id: { in: input.employeeIds } } : {}),
        startDate: { lte: ruleDate },
      },
      orderBy: { firstName: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException('No active employees to pay for that month.');
    }

    const extras = new Map(input.entries?.map((entry) => [entry.employeeId, entry]) || []);
    const runNumber = await this.nextRunNumber();

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          runNumber,
          periodMonth: month,
          periodLabel: month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          ruleDate,
          notes: input.notes,
          createdBy: input.createdBy || 'system',
        },
      });

      let grossTotal = 0;
      let deductionTotal = 0;
      let employerTotal = 0;
      let netTotal = 0;

      for (const employee of employees) {
        const extra = extras.get(employee.id);
        // Daily-rated staff are paid for the days recorded; a monthly salary is
        // the rate itself.
        const basicPay =
          employee.payType === 'DAILY'
            ? round2(Number(employee.payRate) * Number(extra?.daysWorked ?? 0))
            : Number(employee.payRate);

        const calculated = calculatePayslip(
          {
            basicPay,
            allowances: Number(extra?.allowances ?? 0),
            overtime: Number(extra?.overtime ?? 0),
            bonus: Number(extra?.bonus ?? 0),
          },
          rules,
        );

        const payslip = await tx.payslip.create({
          data: {
            runId: run.id,
            employeeId: employee.id,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            employeeNumber: employee.employeeNumber,
            storeId: employee.storeId,
            basicPay,
            allowances: Number(extra?.allowances ?? 0),
            overtime: Number(extra?.overtime ?? 0),
            bonus: Number(extra?.bonus ?? 0),
            grossPay: calculated.grossPay,
            taxablePay: calculated.taxablePay,
            totalDeductions: calculated.totalDeductions,
            employerCost: calculated.employerCost,
            netPay: calculated.netPay,
            daysWorked: employee.payType === 'DAILY' ? Number(extra?.daysWorked ?? 0) : null,
          },
        });

        for (const line of calculated.lines) {
          await tx.payslipLine.create({
            data: {
              payslipId: payslip.id,
              ruleId: line.ruleId,
              code: line.code,
              name: line.name,
              basisAmount: line.basisAmount,
              amount: line.amount,
              employerAmount: line.employerAmount,
              liabilityAccountCode: line.liabilityAccountCode,
            },
          });
        }

        grossTotal += calculated.grossPay;
        deductionTotal += calculated.totalDeductions;
        employerTotal += calculated.employerCost;
        netTotal += calculated.netPay;
      }

      return tx.payrollRun.update({
        where: { id: run.id },
        data: {
          grossTotal: round2(grossTotal),
          deductionTotal: round2(deductionTotal),
          employerCostTotal: round2(employerTotal),
          netTotal: round2(netTotal),
          employeeCount: employees.length,
        },
        include: { payslips: { include: { lines: true } } },
      });
    });
  }

  findRuns(params: { status?: string } = {}) {
    return this.prisma.payrollRun.findMany({
      where: params.status ? { status: params.status as any } : undefined,
      orderBy: { periodMonth: 'desc' },
    });
  }

  async findRun(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: { lines: true, employee: { select: { id: true, department: true, payType: true } } },
          orderBy: { employeeName: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
    return run;
  }

  /**
   * Approves a run and posts it.
   *
   * One entry for the whole run: gross to salary cost tagged by project, each
   * statutory deduction to its own liability, and net pay to cash. Employer
   * contributions are an additional cost with a matching liability.
   */
  async approveRun(id: string, approvedBy?: string) {
    const run = await this.findRun(id);
    if (run.status !== 'DRAFT') {
      throw new BadRequestException(`Only a draft run can be approved (this one is ${run.status}).`);
    }
    if (run.payslips.length === 0) {
      throw new BadRequestException('This run has no payslips.');
    }

    const [salaryAccount, cashAccount] = await Promise.all([
      this.ledger.getAccountByCode(SALARY_EXPENSE),
      this.ledger.getAccountByCode(CASH),
    ]);

    // Gross is split by project so payroll reaches each project's cost report.
    const grossByProject = new Map<string | null, number>();
    const employerByProject = new Map<string | null, number>();
    const liabilityTotals = new Map<string, number>();

    for (const payslip of run.payslips) {
      grossByProject.set(
        payslip.storeId,
        (grossByProject.get(payslip.storeId) || 0) + Number(payslip.grossPay),
      );
      for (const line of payslip.lines) {
        if (!line.liabilityAccountCode) continue;
        const total = liabilityTotals.get(line.liabilityAccountCode) || 0;
        liabilityTotals.set(
          line.liabilityAccountCode,
          total + Number(line.amount) + Number(line.employerAmount),
        );
        if (Number(line.employerAmount) > 0) {
          employerByProject.set(
            payslip.storeId,
            (employerByProject.get(payslip.storeId) || 0) + Number(line.employerAmount),
          );
        }
      }
    }

    const lines: any[] = [];
    for (const [storeId, amount] of grossByProject) {
      if (amount <= 0) continue;
      lines.push({
        accountId: salaryAccount.id,
        debit: round2(amount),
        credit: 0,
        storeId: storeId || undefined,
        memo: `Gross pay — ${run.periodLabel}`,
      });
    }
    for (const [storeId, amount] of employerByProject) {
      if (amount <= 0) continue;
      lines.push({
        accountId: salaryAccount.id,
        debit: round2(amount),
        credit: 0,
        storeId: storeId || undefined,
        memo: `Employer contributions — ${run.periodLabel}`,
      });
    }

    for (const [code, amount] of liabilityTotals) {
      if (amount <= 0) continue;
      const account = await this.ledger.getAccountByCode(code);
      lines.push({ accountId: account.id, debit: 0, credit: round2(amount), memo: `${code} — ${run.periodLabel}` });
    }

    lines.push({
      accountId: cashAccount.id,
      debit: 0,
      credit: round2(Number(run.netTotal)),
      memo: `Net pay — ${run.periodLabel}`,
    });

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.ledger.postJournal(
        {
          memo: `Payroll ${run.runNumber} — ${run.periodLabel}`,
          source: JournalSource.MANUAL,
          sourceId: run.id,
          postedBy: approvedBy,
          lines,
        },
        tx,
      );

      return tx.payrollRun.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: approvedBy || 'system',
          approvedAt: new Date(),
          journalEntryId: journal.id,
        },
      });
    });
  }

  async markPaid(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
    if (run.status !== 'APPROVED') {
      throw new BadRequestException('Only an approved run can be marked paid.');
    }
    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  /**
   * Cancels a run, reversing its posting if it had one.
   *
   * A draft is deleted outright since it never reached the ledger; an approved
   * run is reversed so the correction stays visible.
   */
  async cancelRun(id: string, cancelledBy?: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
    if (run.status === 'CANCELLED') {
      throw new BadRequestException('This run is already cancelled.');
    }
    if (run.status === 'PAID') {
      throw new BadRequestException('A paid run cannot be cancelled. Reverse it in the ledger instead.');
    }

    if (run.status === 'DRAFT') {
      await this.prisma.payrollRun.delete({ where: { id } });
      return { deleted: true, runNumber: run.runNumber };
    }

    if (run.journalEntryId) {
      await this.ledger.reverseJournal(run.journalEntryId, cancelledBy);
    }
    return this.prisma.payrollRun.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** Totals per deduction for a run, for statutory returns. */
  async runSummary(id: string) {
    const run = await this.findRun(id);
    const byDeduction = new Map<string, { code: string; name: string; employee: number; employer: number }>();

    for (const payslip of run.payslips) {
      for (const line of payslip.lines) {
        const current = byDeduction.get(line.code) || {
          code: line.code,
          name: line.name,
          employee: 0,
          employer: 0,
        };
        current.employee += Number(line.amount);
        current.employer += Number(line.employerAmount);
        byDeduction.set(line.code, current);
      }
    }

    return {
      run: {
        id: run.id,
        runNumber: run.runNumber,
        periodLabel: run.periodLabel,
        status: run.status,
        employeeCount: run.employeeCount,
        grossTotal: Number(run.grossTotal),
        deductionTotal: Number(run.deductionTotal),
        employerCostTotal: Number(run.employerCostTotal),
        netTotal: Number(run.netTotal),
      },
      deductions: [...byDeduction.values()].map((row) => ({
        ...row,
        employee: round2(row.employee),
        employer: round2(row.employer),
        total: round2(row.employee + row.employer),
      })),
    };
  }
}
