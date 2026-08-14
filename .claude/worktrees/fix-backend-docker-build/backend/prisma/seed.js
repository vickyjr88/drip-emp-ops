const { PrismaClient, Prisma, UnitStatus } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const seedAdminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@dirrir.com';
const seedAdminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';
const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'];

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

async function syncPermissions() {
  const permissions = getGeneratedCrudPermissions();

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        action: permission.action,
        subject: permission.subject,
        description: permission.description,
        isSystem: true,
      },
      create: permission,
    });
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
  { code: '1500', name: 'Fixed Assets', type: 'ASSET', subtype: 'FIXED_ASSET' },
  { code: '1510', name: 'Accumulated Depreciation', type: 'ASSET', subtype: 'CONTRA_ASSET' },
  { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2200', name: 'Refunds Payable', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2300', name: 'VAT Output', type: 'LIABILITY', subtype: 'VAT_OUTPUT' },
  { code: '2310', name: 'VAT Input', type: 'ASSET', subtype: 'VAT_INPUT' },
  { code: '2320', name: 'Withholding Tax Payable', type: 'LIABILITY', subtype: 'WHT_PAYABLE' },
  { code: '3000', name: "Owner's Equity", type: 'EQUITY', subtype: 'CAPITAL' },
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE', subtype: 'SALES' },
  { code: '4100', name: 'Rental Revenue', type: 'REVENUE', subtype: 'RENTAL' },
  { code: '5000', name: 'General Expense', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5900', name: 'Depreciation Expense', type: 'EXPENSE', subtype: 'DEPRECIATION' },
  { code: '9999', name: 'Suspense', type: 'ASSET', subtype: 'SUSPENSE' },
];

async function seedChartOfAccounts() {
  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    await prisma.chartOfAccount.upsert({
      where: { code: account.code },
      update: { name: account.name, type: account.type, subtype: account.subtype, isSystem: true },
      create: { ...account, isSystem: true },
    });
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

async function ensureBlock(projectId, blockName, totalFloors) {
  const existing = await prisma.projectBlock.findFirst({
    where: { projectId, blockName },
  });

  if (existing) {
    return prisma.projectBlock.update({
      where: { id: existing.id },
      data: { totalFloors },
    });
  }

  return prisma.projectBlock.create({
    data: {
      projectId,
      blockName,
      totalFloors,
    },
  });
}

async function ensureUnit(blockId, data) {
  const existing = await prisma.unit.findFirst({
    where: {
      blockId,
      unitNumber: data.unitNumber,
    },
  });

  if (existing) {
    return prisma.unit.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.unit.create({
    data: {
      blockId,
      ...data,
    },
  });
}

async function main() {
  const generatedPermissions = await syncPermissions();
  await seedCurrencies();
  await seedChartOfAccounts();
  await seedTaxRates();

  const cashAccount = await prisma.chartOfAccount.findUnique({ where: { code: '1000' } });
  await prisma.bankAccount.upsert({
    where: { glAccountId: cashAccount.id },
    update: { name: 'Main Operating Account', bankName: 'Primary Bank', accountNumber: '0000000000' },
    create: {
      name: 'Main Operating Account',
      bankName: 'Primary Bank',
      accountNumber: '0000000000',
      currencyCode: 'KES',
      glAccountId: cashAccount.id,
    },
  });

  const adminPassword = await bcrypt.hash(seedAdminPassword, 10);

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {
      description: 'System administrator with full access',
      isSystem: true,
    },
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

  const admin = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {
      name: 'Dirrir Administrator',
      role: 'ADMIN',
      password: adminPassword,
    },
    create: {
      email: seedAdminEmail,
      name: 'Dirrir Administrator',
      role: 'ADMIN',
      password: adminPassword,
    },
  });

  await setUserRoles(admin.id, [adminRole.id]);

  const project = await prisma.project.upsert({
    where: { code: 'ZENITH-2026' },
    update: {
      name: 'Zenith Penthouse Residences',
      description: 'A flagship luxury development blending elevated skyline views, private leisure amenities, and curated family living in Westlands.',
      location: 'Westlands, Nairobi',
      featuredImageUrl: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1400&q=80',
      galleryImages: [
        'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1200&q=80',
      ],
      isArchived: false,
    },
    create: {
      code: 'ZENITH-2026',
      name: 'Zenith Penthouse Residences',
      description: 'A flagship luxury development blending elevated skyline views, private leisure amenities, and curated family living in Westlands.',
      location: 'Westlands, Nairobi',
      featuredImageUrl: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1400&q=80',
      galleryImages: [
        'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1200&q=80',
      ],
      isArchived: false,
    },
  });

  const blockA = await ensureBlock(project.id, 'A', 28);
  const blockB = await ensureBlock(project.id, 'B', 24);

  const unitA1201 = await ensureUnit(blockA.id, {
    unitNumber: 'A-1201',
    floorNumber: 12,
    sizeSqm: 245.5,
    priceKes: 78000000,
    priceUsd: 590000,
    status: UnitStatus.AVAILABLE,
    bedrooms: 3,
    parkingSlots: 2,
    hasBalcony: true,
    hasStore: true,
    floorPlanUrl: '/floorplans/a-1201.pdf',
    version: 1,
  });

  const unitA1802 = await ensureUnit(blockA.id, {
    unitNumber: 'A-1802',
    floorNumber: 18,
    sizeSqm: 312.75,
    priceKes: 98000000,
    priceUsd: 745000,
    status: UnitStatus.RESERVED,
    bedrooms: 4,
    parkingSlots: 3,
    hasBalcony: true,
    hasStore: true,
    floorPlanUrl: '/floorplans/a-1802.pdf',
    version: 1,
  });

  const unitB905 = await ensureUnit(blockB.id, {
    unitNumber: 'B-905',
    floorNumber: 9,
    sizeSqm: 188.2,
    priceKes: 62000000,
    priceUsd: 470000,
    status: UnitStatus.SOLD,
    bedrooms: 2,
    parkingSlots: 2,
    hasBalcony: true,
    hasStore: false,
    floorPlanUrl: '/floorplans/b-905.pdf',
    version: 1,
  });

  const customerAmina = await prisma.customer.upsert({
    where: { email: 'amina.hassan@example.com' },
    update: {
      firstName: 'Amina',
      lastName: 'Hassan',
      phone: '+254700111222',
      nationalIdPassport: 'A1234567',
      kraPin: 'A001239874K',
      nextOfKinJson: {
        name: 'Yusuf Hassan',
        relationship: 'Spouse',
        phone: '+254700111333',
      },
    },
    create: {
      firstName: 'Amina',
      lastName: 'Hassan',
      email: 'amina.hassan@example.com',
      phone: '+254700111222',
      nationalIdPassport: 'A1234567',
      kraPin: 'A001239874K',
      nextOfKinJson: {
        name: 'Yusuf Hassan',
        relationship: 'Spouse',
        phone: '+254700111333',
      },
    },
  });

  const customerDavid = await prisma.customer.upsert({
    where: { email: 'david.owino@example.com' },
    update: {
      firstName: 'David',
      lastName: 'Owino',
      phone: '+254711444555',
      nationalIdPassport: 'B7654321',
      kraPin: 'A007891245P',
      nextOfKinJson: {
        name: 'Ruth Owino',
        relationship: 'Sister',
        phone: '+254711444556',
      },
    },
    create: {
      firstName: 'David',
      lastName: 'Owino',
      email: 'david.owino@example.com',
      phone: '+254711444555',
      nationalIdPassport: 'B7654321',
      kraPin: 'A007891245P',
      nextOfKinJson: {
        name: 'Ruth Owino',
        relationship: 'Sister',
        phone: '+254711444556',
      },
    },
  });

  const ownership = await prisma.unitOwnership.findFirst({
    where: {
      unitId: unitB905.id,
      customerId: customerAmina.id,
    },
  });

  if (!ownership) {
    await prisma.unitOwnership.create({
      data: {
        unitId: unitB905.id,
        customerId: customerAmina.id,
        ownershipPercentage: 100,
        isPrimaryOwner: true,
      },
    });
  }

  const contract = await prisma.salesContract.upsert({
    where: { contractNumber: 'SC-2026-0001' },
    update: {
      unitId: unitB905.id,
      primaryCustomerId: customerAmina.id,
      currency: 'KES',
      totalAgreedPrice: 62000000,
      contractStatus: 'ACTIVE',
    },
    create: {
      contractNumber: 'SC-2026-0001',
      unitId: unitB905.id,
      primaryCustomerId: customerAmina.id,
      currency: 'KES',
      totalAgreedPrice: 62000000,
      contractStatus: 'ACTIVE',
    },
  });

  const payment = await prisma.customerPayment.upsert({
    where: { receiptNumber: 'RCT-2026-0101' },
    update: {
      contractId: contract.id,
      amountPaid: 15500000,
      currency: 'KES',
      paymentMethod: 'BANK_TRANSFER',
      transactionReference: 'TXN-9FJ23KL88',
    },
    create: {
      receiptNumber: 'RCT-2026-0101',
      contractId: contract.id,
      amountPaid: 15500000,
      currency: 'KES',
      paymentMethod: 'BANK_TRANSFER',
      transactionReference: 'TXN-9FJ23KL88',
    },
  });

  const audit = await prisma.paymentReallocationAudit.findFirst({
    where: {
      paymentId: payment.id,
      reason: 'Initial installment allocation',
    },
  });

  if (!audit) {
    await prisma.paymentReallocationAudit.create({
      data: {
        paymentId: payment.id,
        sourceContractId: null,
        destinationContractId: contract.id,
        reallocatedAmount: 15500000,
        reason: 'Initial installment allocation',
        reallocatedBy: admin.email,
      },
    });
  }

  const reservedOwnership = await prisma.unitOwnership.findFirst({
    where: {
      unitId: unitA1802.id,
      customerId: customerDavid.id,
    },
  });

  if (!reservedOwnership) {
    await prisma.unitOwnership.create({
      data: {
        unitId: unitA1802.id,
        customerId: customerDavid.id,
        ownershipPercentage: 100,
        isPrimaryOwner: true,
      },
    });
  }

  const allOwnerships = await prisma.unitOwnership.findMany();
  for (const item of allOwnerships) {
    const existingAudit = await prisma.ownershipChangeAudit.findFirst({
      where: {
        ownershipId: item.id,
        action: 'ASSIGNED',
      },
    });
    if (!existingAudit) {
      await prisma.ownershipChangeAudit.create({
        data: {
          unitId: item.unitId,
          ownershipId: item.id,
          action: 'ASSIGNED',
          toCustomerId: item.customerId,
          toPercentage: item.ownershipPercentage,
          toIsPrimary: item.isPrimaryOwner,
          reason: 'Seeded ownership record',
          changedBy: admin.email,
          timestamp: item.acquiredAt,
        },
      });
    }
  }

  let rentalTenancy = await prisma.tenancy.findFirst({
    where: {
      unitId: unitA1201.id,
      tenantId: customerDavid.id,
      status: 'ACTIVE',
    },
  });

  if (!rentalTenancy) {
    rentalTenancy = await prisma.tenancy.create({
      data: {
        unitId: unitA1201.id,
        tenantId: customerDavid.id,
        leaseStart: new Date('2026-01-01'),
        status: 'ACTIVE',
        monthlyRent: 185000,
        currency: 'KES',
        depositAmount: 370000,
        notes: '12-month residential lease',
      },
    });
  }

  await prisma.unit.update({
    where: { id: unitA1201.id },
    data: { status: UnitStatus.RENTED },
  });

  const rentalPayments = [
    {
      receiptNumber: 'RR-2026-0101',
      category: 'RENT',
      amountPaid: 185000,
      transactionReference: 'RENT-TXN-0101',
      paymentDate: new Date('2026-01-05'),
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
    },
    {
      receiptNumber: 'RR-2026-0102',
      category: 'WATER',
      amountPaid: 4200,
      transactionReference: 'UTIL-WATER-0102',
      paymentDate: new Date('2026-01-08'),
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
    },
    {
      receiptNumber: 'RR-2026-0103',
      category: 'ELECTRICITY',
      amountPaid: 9800,
      transactionReference: 'UTIL-ELEC-0103',
      paymentDate: new Date('2026-01-09'),
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
    },
    {
      receiptNumber: 'RR-2026-0201',
      category: 'RENT',
      amountPaid: 185000,
      transactionReference: 'RENT-TXN-0201',
      paymentDate: new Date('2026-02-04'),
      billingPeriodStart: new Date('2026-02-01'),
      billingPeriodEnd: new Date('2026-02-28'),
    },
    {
      receiptNumber: 'RR-2026-0202',
      category: 'SERVICE_CHARGE',
      amountPaid: 15000,
      transactionReference: 'UTIL-SVC-0202',
      paymentDate: new Date('2026-02-06'),
      billingPeriodStart: new Date('2026-02-01'),
      billingPeriodEnd: new Date('2026-02-28'),
    },
  ];

  for (const payment of rentalPayments) {
    await prisma.rentalPayment.upsert({
      where: { receiptNumber: payment.receiptNumber },
      update: {
        tenancyId: rentalTenancy.id,
        category: payment.category,
        amountPaid: payment.amountPaid,
        currency: 'KES',
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: payment.transactionReference,
        paymentDate: payment.paymentDate,
        billingPeriodStart: payment.billingPeriodStart,
        billingPeriodEnd: payment.billingPeriodEnd,
      },
      create: {
        tenancyId: rentalTenancy.id,
        receiptNumber: payment.receiptNumber,
        category: payment.category,
        amountPaid: payment.amountPaid,
        currency: 'KES',
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: payment.transactionReference,
        paymentDate: payment.paymentDate,
        billingPeriodStart: payment.billingPeriodStart,
        billingPeriodEnd: payment.billingPeriodEnd,
      },
    });
  }

  console.log('Seed complete.');
  console.log('Admin login:', {
    email: seedAdminEmail,
    password: '[set via ADMIN_SEED_PASSWORD]',
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
