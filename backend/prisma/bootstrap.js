/**
 * Startup bootstrap: seeds application configuration, never demo data.
 *
 * Run from the container entrypoint on every start. Migrations create the
 * tables but leave them empty, so a start that bypasses scripts/deploy.sh
 * would otherwise come up with no permissions, no roles, no chart of accounts
 * and nobody able to log in.
 *
 * The actual work lives in prisma/seed-config.js, shared with prisma/seed.js
 * so the two cannot drift. Everything it does is idempotent; see that file.
 */
const { PrismaClient } = require('@prisma/client');
const { createConfigSeeder } = require('./seed-config');

const prisma = new PrismaClient();

async function main() {
  console.log('Bootstrap: seeding application configuration');
  const { seedConfig } = createConfigSeeder(prisma);
  await seedConfig();
  console.log('Bootstrap: complete.');
}

main()
  .catch((error) => {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
