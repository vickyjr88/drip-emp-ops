/**
 * Application configuration seeding -- the rows the app needs to function at
 * all, as distinct from the demo data in seed.js.
 *
 * Shared by two callers:
 *   - prisma/bootstrap.js, run from the container entrypoint on every start,
 *     so a deploy that bypasses scripts/deploy.sh still comes up usable.
 *   - prisma/seed.js, which calls this first and then layers demo projects,
 *     units, customers and transactions on top for staging.
 *
 * Everything here is idempotent: upserts, or guarded creates keyed on a natural
 * key. Re-running must never duplicate a row or overwrite an operator's later
 * edits. Anything not safe to re-run belongs in seed.js instead.
 *
 * Exposed as a factory taking the caller's PrismaClient, so both callers share
 * one connection rather than opening a second pool.
 */
const { Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'];

function createConfigSeeder(prisma) {
function normalizePermissionSubject(subject) {
  return subject
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function buildPermissionKey(subject, action) {
  return `${normalizePermissionSubject(subject)}.${action.toLowerCase()}`;
}

function getGeneratedCrudPermissions() {
  return Prisma.dmmf.datamodel.models.flatMap((model) =>
    CRUD_ACTIONS.map((action) => ({
      action,
      subject: model.name,
      key: buildPermissionKey(model.name, action),
      description: `${action.toUpperCase()} ${model.name}`,
      isSystem: true,
    })),
  );
}

/**
 * Permission has two unique constraints -- `key` and `@@unique([subject,
 * action])` -- so a plain upsert on `key` is not safe. A database seeded by an
 * earlier version of this file can hold a row whose (subject, action) matches
 * but whose key does not (a model renamed since, or a change in how keys are
 * built). The upsert then finds nothing by key, takes the create path, and
 * dies on the second constraint with P2002.
 *
 * Resolve against both: look the row up by key first, fall back to (subject,
 * action), and update whichever we find so the stale key is corrected in
 * place. Only create when neither matches.
 */
async function syncPermissions() {
  const permissions = getGeneratedCrudPermissions();

  for (const permission of permissions) {
    const existing =
      (await prisma.permission.findUnique({ where: { key: permission.key } })) ||
      (await prisma.permission.findUnique({
        where: {
          subject_action: { subject: permission.subject, action: permission.action },
        },
      }));

    if (existing) {
      await prisma.permission.update({
        where: { id: existing.id },
        data: {
          key: permission.key,
          action: permission.action,
          subject: permission.subject,
          description: permission.description,
          isSystem: true,
        },
      });
      continue;
    }

    await prisma.permission.create({ data: permission });
  }

  return prisma.permission.findMany({
    where: { key: { in: permissions.map((permission) => permission.key) } },
    orderBy: [{ subject: 'asc' }, { action: 'asc' }],
  });
}

async function setRolePermissions(roleId, permissionIds) {
  await prisma.rolePermission.deleteMany({ where: { roleId } });

  if (!permissionIds.length) {
    return;
  }

  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
}

async function setUserRoles(userId, roleIds) {
  await prisma.userRole.deleteMany({ where: { userId } });

  if (!roleIds.length) {
    return;
  }

  await prisma.userRole.createMany({
    data: roleIds.map((roleId) => ({ userId, roleId })),
    skipDuplicates: true,
  });
}

const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: '1000', name: 'Cash and Bank', type: 'ASSET', subtype: 'CASH' },
  { code: '1010', name: 'Petty Cash', type: 'ASSET', subtype: 'CASH' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subtype: 'RECEIVABLE' },
  { code: '1200', name: 'Inventory', type: 'ASSET', subtype: 'INVENTORY' },
  { code: '1500', name: 'Fixed Assets', type: 'ASSET', subtype: 'FIXED_ASSET' },
  { code: '1510', name: 'Accumulated Depreciation', type: 'ASSET', subtype: 'CONTRA_ASSET' },
  { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2150', name: 'Reseller Commissions Payable', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2200', name: 'Refunds Payable', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2300', name: 'VAT Output', type: 'LIABILITY', subtype: 'VAT_OUTPUT' },
  { code: '2310', name: 'VAT Input', type: 'ASSET', subtype: 'VAT_INPUT' },
  { code: '2320', name: 'Withholding Tax Payable', type: 'LIABILITY', subtype: 'WHT_PAYABLE' },
  { code: '2330', name: 'PAYE Payable', type: 'LIABILITY', subtype: 'PAYROLL' },
  { code: '2340', name: 'NSSF Payable', type: 'LIABILITY', subtype: 'PAYROLL' },
  { code: '2350', name: 'SHIF Payable', type: 'LIABILITY', subtype: 'PAYROLL' },
  { code: '2360', name: 'Housing Levy Payable', type: 'LIABILITY', subtype: 'PAYROLL' },
  { code: '2370', name: 'Net Pay Payable', type: 'LIABILITY', subtype: 'PAYROLL' },
  { code: '3000', name: "Owner's Equity", type: 'EQUITY', subtype: 'CAPITAL' },
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE', subtype: 'SALES' },
  { code: '4200', name: 'Wholesale Revenue', type: 'REVENUE', subtype: 'SALES' },
  { code: '4900', name: 'Sales Discounts', type: 'REVENUE', subtype: 'SALES' },
  { code: '5000', name: 'General Expense', type: 'EXPENSE', subtype: 'OPERATING' },
  // Retail cost structure: what the goods cost, then what running the shops
  // costs, so a profit and loss separates margin from overheads.
  { code: '5300', name: 'Cost of Goods Sold', type: 'EXPENSE', subtype: 'COGS' },
  { code: '5310', name: 'Inventory Shrinkage', type: 'EXPENSE', subtype: 'COGS', parentCode: '5300' },
  { code: '5320', name: 'Reseller Commission Expense', type: 'EXPENSE', subtype: 'COGS', parentCode: '5300' },
  { code: '5400', name: 'Shop Operating Costs', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5410', name: 'Salaries & Staff Costs', type: 'EXPENSE', subtype: 'OPERATING', parentCode: '5400' },
  { code: '5420', name: 'Shop Rent', type: 'EXPENSE', subtype: 'OPERATING', parentCode: '5400' },
  { code: '5430', name: 'Other Operating Costs', type: 'EXPENSE', subtype: 'OPERATING', parentCode: '5400' },
  { code: '5440', name: 'Delivery & Transport', type: 'EXPENSE', subtype: 'OPERATING', parentCode: '5400' },
  { code: '5900', name: 'Depreciation Expense', type: 'EXPENSE', subtype: 'DEPRECIATION' },
  { code: '9999', name: 'Suspense', type: 'ASSET', subtype: 'SUSPENSE' },
];

async function seedChartOfAccounts() {
  // Two passes: every account must exist before parents can be linked.
  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    const { parentCode, ...data } = account;
    await prisma.chartOfAccount.upsert({
      where: { code: data.code },
      update: { name: data.name, type: data.type, subtype: data.subtype, isSystem: true },
      create: { ...data, isSystem: true },
    });
  }

  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    if (!account.parentCode) continue;
    const parent = await prisma.chartOfAccount.findUnique({ where: { code: account.parentCode } });
    if (parent) {
      await prisma.chartOfAccount.update({
        where: { code: account.code },
        data: { parentId: parent.id },
      });
    }
  }
}

const DEFAULT_TAX_RATES = [
  { name: 'VAT 16% (Standard)', code: 'VAT_STD', rate: 0.16, appliesTo: 'OUTPUT', glAccountCode: '2300' },
  { name: 'VAT Input 16%', code: 'VAT_INPUT_STD', rate: 0.16, appliesTo: 'INPUT', glAccountCode: '2310' },
  { name: 'WHT 5% (Professional/Contractual Services)', code: 'WHT_5', rate: 0.05, appliesTo: 'WITHHOLDING', glAccountCode: '2320' },
  { name: 'WHT 3% (Contractors — Building/Civil Works)', code: 'WHT_3', rate: 0.03, appliesTo: 'WITHHOLDING', glAccountCode: '2320' },
];

async function seedTaxRates() {
  for (const rate of DEFAULT_TAX_RATES) {
    const glAccount = await prisma.chartOfAccount.findUnique({ where: { code: rate.glAccountCode } });
    if (!glAccount) continue;
    await prisma.taxRate.upsert({
      where: { code: rate.code },
      update: { name: rate.name, rate: rate.rate, appliesTo: rate.appliesTo, glAccountId: glAccount.id },
      create: { name: rate.name, code: rate.code, rate: rate.rate, appliesTo: rate.appliesTo, glAccountId: glAccount.id },
    });
  }
}

// Kenyan statutory minimums: 21 working days annual leave, 3 months maternity,
// 2 weeks paternity. Sick leave varies by contract; 14 days is a common policy.
const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', annualDays: 21, carriesOver: true, maxCarryOver: 10, isPaid: true },
  { code: 'SICK', name: 'Sick Leave', annualDays: 14, carriesOver: false, isPaid: true },
  { code: 'MATERNITY', name: 'Maternity Leave', annualDays: 90, carriesOver: false, isPaid: true },
  { code: 'PATERNITY', name: 'Paternity Leave', annualDays: 14, carriesOver: false, isPaid: true },
  { code: 'COMPASSIONATE', name: 'Compassionate Leave', annualDays: 5, carriesOver: false, isPaid: true },
  { code: 'UNPAID', name: 'Unpaid Leave', annualDays: 0, carriesOver: false, isPaid: false },
];

async function seedLeaveTypes() {
  for (const type of DEFAULT_LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { code: type.code },
      update: { name: type.name, annualDays: type.annualDays, isPaid: type.isPaid },
      create: type,
    });
  }
}

// Kenyan statutory deductions as at the 2024 Finance Act and the SHIF
// transition. These are seeded as *configuration*, versioned by effectiveFrom:
// when rates change, add a new version rather than editing these, so payslips
// already run stay reproducible.
//
// VERIFY THESE AGAINST CURRENT KRA/NSSF/SHIF GUIDANCE BEFORE PAYING ANYONE.
const DEFAULT_DEDUCTION_RULES = [
  {
    code: 'NSSF',
    name: 'NSSF (Tier I & II)',
    kind: 'TIERED',
    basis: 'GROSS',
    effectiveFrom: new Date('2024-02-01'),
    reducesTaxable: true,
    liabilityAccountCode: '2340',
    employerRate: 0.06,
    notes: 'Tier I on the first 8,000; Tier II on 8,001–72,000. Employer matches.',
    bands: [
      { sequence: 1, lowerBound: 0, upperBound: 8000, rate: 0.06 },
      { sequence: 2, lowerBound: 8000, upperBound: 72000, rate: 0.06 },
    ],
  },
  {
    code: 'HOUSING',
    name: 'Affordable Housing Levy',
    kind: 'PERCENTAGE',
    basis: 'GROSS',
    effectiveFrom: new Date('2024-07-01'),
    rate: 0.015,
    employerRate: 0.015,
    reducesTaxable: true,
    liabilityAccountCode: '2360',
    notes: '1.5% employee, matched by the employer.',
  },
  {
    code: 'SHIF',
    name: 'Social Health Insurance Fund',
    kind: 'PERCENTAGE',
    basis: 'GROSS',
    effectiveFrom: new Date('2024-10-01'),
    rate: 0.0275,
    reducesTaxable: true,
    liabilityAccountCode: '2350',
    notes: '2.75% of gross, replacing NHIF.',
  },
  {
    code: 'PAYE',
    name: 'PAYE',
    kind: 'GRADUATED',
    basis: 'TAXABLE',
    effectiveFrom: new Date('2024-07-01'),
    reliefAmount: 2400,
    liabilityAccountCode: '2330',
    notes: 'Graduated bands with 2,400 monthly personal relief.',
    bands: [
      { sequence: 1, lowerBound: 0, upperBound: 24000, rate: 0.1 },
      { sequence: 2, lowerBound: 24000, upperBound: 32333, rate: 0.25 },
      { sequence: 3, lowerBound: 32333, upperBound: 500000, rate: 0.3 },
      { sequence: 4, lowerBound: 500000, upperBound: 800000, rate: 0.325 },
      { sequence: 5, lowerBound: 800000, upperBound: null, rate: 0.35 },
    ],
  },
];

async function seedDeductionRules() {
  for (const rule of DEFAULT_DEDUCTION_RULES) {
    const { bands = [], ...data } = rule;
    const existing = await prisma.deductionRule.findFirst({
      where: { code: data.code, effectiveFrom: data.effectiveFrom },
    });
    if (existing) continue;
    await prisma.deductionRule.create({
      data: { ...data, isStatutory: true, bands: { create: bands } },
    });
  }
}

async function seedCurrencies() {
  await prisma.currency.upsert({
    where: { code: 'KES' },
    update: { name: 'Kenyan Shilling', isBase: true, symbol: 'KSh' },
    create: { code: 'KES', name: 'Kenyan Shilling', isBase: true, symbol: 'KSh' },
  });
  await prisma.currency.upsert({
    where: { code: 'USD' },
    update: { name: 'US Dollar', isBase: false, symbol: '$' },
    create: { code: 'USD', name: 'US Dollar', isBase: false, symbol: '$' },
  });
}


/**
 * Permissions, the ADMIN role and the admin user.
 *
 * The account is only created when the database has no users at all, so a
 * routine restart never resets a password changed in-app. ADMIN_SEED_FORCE=true
 * re-asserts the environment credentials to recover a locked-out instance.
 * Permissions and the role sync every run so newly added models become
 * grantable without a manual step.
 */
async function seedRbac(options = {}) {
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@dripemporium.store';
  const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';
  const force = process.env.ADMIN_SEED_FORCE === 'true' || options.force === true;

  const generatedPermissions = await syncPermissions();

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: { description: 'System administrator with full access', isSystem: true },
    create: {
      name: 'ADMIN',
      description: 'System administrator with full access',
      isSystem: true,
    },
  });

  await setRolePermissions(
    adminRole.id,
    generatedPermissions.map((permission) => permission.id),
  );

  const userCount = await prisma.user.count();
  if (userCount > 0 && !force) {
    console.log(`  RBAC synced; ${userCount} user(s) present, accounts untouched.`);
    return { adminRole, admin: null };
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Drip Emporium Administrator',
      role: 'ADMIN',
      password: await bcrypt.hash(password, 10),
    },
    create: {
      email,
      name: 'Drip Emporium Administrator',
      role: 'ADMIN',
      password: await bcrypt.hash(password, 10),
    },
  });

  await setUserRoles(admin.id, [adminRole.id]);
  console.log(`  Admin account ready (${email}).`);
  return { adminRole, admin };
}

/**
 * The default operating bank account, linked to GL 1000.
 *
 * The account number is a placeholder: the ledger needs a bank account to post
 * against, and a visibly fake number an operator can correct is better than a
 * missing record that breaks posting. Only created when none exists.
 */
async function seedDefaultBankAccount() {
  const cashAccount = await prisma.chartOfAccount.findUnique({ where: { code: '1000' } });
  if (!cashAccount) return;
  const existing = await prisma.bankAccount.findFirst({
    where: { glAccountId: cashAccount.id },
  });
  if (existing) return;
  await prisma.bankAccount.create({
    data: {
      name: 'Main Operating Account',
      bankName: 'Primary Bank',
      accountNumber: '0000000000',
      currencyCode: 'KES',
      glAccountId: cashAccount.id,
    },
  });
}

// Reminder cadence for sales installments, rent and utilities. Guarded on name
// so an operator who edits or deletes a rule does not get it recreated.
const DEFAULT_REMINDER_RULES = [
  { name: 'Installment due in 15 days', targetType: 'SALES_INSTALLMENT', timing: 'BEFORE_DUE', offsetDays: 15, channel: 'BOTH' },
  { name: 'Installment due in 10 days', targetType: 'SALES_INSTALLMENT', timing: 'BEFORE_DUE', offsetDays: 10, channel: 'BOTH' },
  { name: 'Installment due in 5 days', targetType: 'SALES_INSTALLMENT', timing: 'BEFORE_DUE', offsetDays: 5, channel: 'BOTH' },
  {
    name: 'Installment overdue by 5 days',
    targetType: 'SALES_INSTALLMENT',
    timing: 'AFTER_DUE_IF_UNPAID',
    offsetDays: 5,
    channel: 'BOTH',
    smsTemplate:
      'Hi {{customerName}}, your installment of {{currency}} {{amount}} was due on {{dueDate}} ({{daysOverdue}} days ago) and is still outstanding. Please settle it at your earliest convenience.',
  },
  { name: 'Rent due in 5 days', targetType: 'RENT', timing: 'BEFORE_DUE', offsetDays: 5, channel: 'BOTH' },
  {
    name: 'Rent overdue by 3 days',
    targetType: 'RENT',
    timing: 'AFTER_DUE_IF_UNPAID',
    offsetDays: 3,
    channel: 'BOTH',
    smsTemplate:
      'Hi {{customerName}}, rent of {{currency}} {{amount}} for unit {{unitNumber}} was due on {{dueDate}} and is still outstanding. Please make payment to avoid penalties.',
  },
  { name: 'Utility due in 5 days', targetType: 'UTILITY', timing: 'BEFORE_DUE', offsetDays: 5, channel: 'BOTH' },
  {
    name: 'Utility overdue by 3 days',
    targetType: 'UTILITY',
    timing: 'AFTER_DUE_IF_UNPAID',
    offsetDays: 3,
    channel: 'BOTH',
    smsTemplate:
      'Hi {{customerName}}, {{description}} of {{currency}} {{amount}} was due on {{dueDate}} and remains unpaid. Kindly settle it. Thank you.',
  },
];

async function seedReminderRules() {
  for (const rule of DEFAULT_REMINDER_RULES) {
    const existing = await prisma.reminderRule.findFirst({ where: { name: rule.name } });
    if (existing) continue;
    await prisma.reminderRule.create({ data: rule });
  }
}

/**
 * Order matters: tax rates and deduction rules look up GL accounts by code and
 * silently skip when one is missing, so the chart of accounts must exist first.
 */
async function seedConfig(options = {}) {
  await seedCurrencies();
  await seedChartOfAccounts();
  await seedTaxRates();
  await seedLeaveTypes();
  await seedDeductionRules();
  await seedDefaultBankAccount();
  await seedReminderRules();
  const rbac = await seedRbac(options);
  return rbac;
}

  return {
    seedConfig,
    seedRbac,
    syncPermissions,
    setRolePermissions,
    setUserRoles,
    DEFAULT_CHART_OF_ACCOUNTS,
  };
}

module.exports = { createConfigSeeder };
