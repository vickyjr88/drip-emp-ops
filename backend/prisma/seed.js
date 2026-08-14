/**
 * DEMO seeding -- staging and local development only.
 *
 * Inserts a sample project, blocks, units, customers, a sales contract,
 * payments, ownership trails and a tenancy so a fresh environment has
 * something to look at. None of this belongs in production: scripts/deploy.sh
 * defaults RUN_SEED=false, and the deploy workflow only sets it via an
 * explicit workflow_dispatch input.
 *
 * Application configuration -- permissions, roles, the admin user, chart of
 * accounts, tax rates, leave types, statutory deductions, reminder rules --
 * lives in prisma/seed-config.js and is applied on every container start by
 * prisma/bootstrap.js. This script calls it first so a demo environment can be
 * built in one command.
 */
const { PrismaClient, Prisma, UnitStatus } = require('@prisma/client');
const { createConfigSeeder } = require('./seed-config');

const prisma = new PrismaClient();
const { seedConfig } = createConfigSeeder(prisma);

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
  // Configuration first: the demo rows below reference GL accounts, the admin
  // user and currencies that seedConfig creates.
  const { admin: bootstrappedAdmin } = await seedConfig({ force: true });
  const admin =
    bootstrappedAdmin ||
    (await prisma.user.findUnique({
      where: { email: process.env.ADMIN_SEED_EMAIL || 'admin@dirrir.com' },
    }));

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


  console.log('Demo seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
