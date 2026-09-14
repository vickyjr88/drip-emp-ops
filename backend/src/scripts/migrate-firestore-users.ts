/**
 * One-time migration: Firestore `users` (from the legacy Flutter app, project
 * "drip-emporium-store") -> Customer rows here, then a welcome email to each
 * newly-created customer.
 *
 * Deliberately NOT a NestJS module/endpoint -- this runs once, by hand, from
 * a terminal with real production credentials in scope. Uses
 * NestFactory.createApplicationContext so it can reuse the app's actual
 * EmailSenderService (same SMTP->Brevo fallback, same branded HTML shell)
 * rather than duplicating email config and sending logic here.
 *
 * Lives under src/ (not a top-level scripts/ directory) specifically so
 * `npm run build`'s tsc pass picks it up -- tsconfig.json's rootDir is "src"
 * and include is ["src/**\/*.ts"], so a file outside src/ is never compiled
 * and the runtime image (which ships only dist/, not raw TypeScript) would
 * have nothing to run. This compiles to dist/scripts/migrate-firestore-users.js
 * alongside every other module, with its relative imports resolving exactly
 * as they do here since dist/ mirrors src/'s structure 1:1.
 *
 * Run with (inside the backend container, where DATABASE_URL/email config
 * are already injected by docker-compose -- no .env file to load here):
 *   docker exec drip-emp-ops-backend-1 node dist/scripts/migrate-firestore-users.js
 *
 * Pass --dry-run first to see exactly what would happen -- how many
 * Firestore users, how many already exist as a Customer, how many would be
 * newly created -- with zero writes and zero emails sent:
 *   docker exec drip-emp-ops-backend-1 node dist/scripts/migrate-firestore-users.js --dry-run
 *
 * Safe to re-run: a Firestore user whose email already exists as a Customer
 * is skipped (not updated, not re-emailed) -- see `existingEmails` below.
 * Only genuinely new customers get created and emailed.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSenderService } from '../email-log/email-sender.service';
import { escapeHtml, money, ctaButton } from '../email-log/email-html.util';
import { storefrontOrigin } from '../common/storefront-origin';

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!SERVICE_ACCOUNT_PATH) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT_PATH to the downloaded service account JSON.');
  process.exit(1);
}

/** Splits a Firestore displayName into firstName/lastName the way Customer
 *  requires both fields non-null. A blank or single-word name puts
 *  everything in firstName and leaves lastName as a single space rather than
 *  an empty string -- Customer.lastName has no @default and is not optional,
 *  so it must hold *something*, and "" reads worse in a name field than a
 *  harmless space. */
function splitName(displayName: string | undefined, email: string): { firstName: string; lastName: string } {
  const trimmed = (displayName || '').trim();
  if (!trimmed) {
    // No display name on file at all -- fall back to the email's local part
    // rather than leaving firstName blank, since Customer.firstName is
    // required and a blank name is worse than an imperfect guess.
    const local = email.split('@')[0] || 'Customer';
    return { firstName: local, lastName: ' ' };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: ' ' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Firestore's mobileNumber is free-text from a phone-input UI, not
 *  guaranteed E.164. Customer.phone is required and non-empty; a genuinely
 *  blank number is recorded as "unknown" rather than skipping the row --
 *  losing an otherwise-migratable customer over a missing phone number
 *  would defeat the point of the migration. */
function normalisePhone(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  return trimmed || 'unknown';
}

type FeaturedProduct = {
  name: string;
  slug: string;
  imageUrl: string | null;
  priceKes: number;
};

async function pickRandomProducts(prisma: PrismaService, count: number): Promise<FeaturedProduct[]> {
  // Pulled at request time, not once and reused, so every customer in a
  // large batch does not all receive the identical six products -- the ask
  // was "pick six random products" per email, not "pick six once for the
  // whole run".
  const candidates = await prisma.product.findMany({
    where: { isActive: true, OR: [{ categoryId: null }, { category: { isActive: true } }] },
    include: { variants: { where: { isActive: true }, orderBy: { priceKes: 'asc' }, take: 1 } },
  });

  const withImageAndPrice = candidates.filter(
    (product) => Array.isArray(product.imageUrls) && product.imageUrls.length > 0 && product.variants[0],
  );

  // Fisher-Yates, not .sort(() => Math.random() - 0.5) -- the sort-comparator
  // trick is a well-known biased shuffle; this is not, and the list here is
  // small enough that the O(n) cost is irrelevant.
  const shuffled = [...withImageAndPrice];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count).map((product) => ({
    name: product.name,
    slug: product.slug,
    imageUrl: (product.imageUrls as string[])[0] ?? null,
    priceKes: Number(product.variants[0].priceKes),
  }));
}

function productGridHtml(products: FeaturedProduct[]): string {
  const origin = storefrontOrigin();
  const cells = products.map(
    (product) => `
        <td style="width:33.33%;padding:8px;vertical-align:top;">
          <a href="${escapeHtml(`${origin}/shop/${product.slug}`)}" style="text-decoration:none;">
            ${
              product.imageUrl
                ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" width="150" style="width:100%;max-width:150px;border-radius:8px;display:block;margin:0 auto 8px;">`
                : ''
            }
            <p style="margin:0;font-size:13px;font-weight:600;text-align:center;">${escapeHtml(product.name)}</p>
            <p style="margin:2px 0 0;font-size:13px;text-align:center;color:#5b6480;">${escapeHtml(money(product.priceKes))}</p>
          </a>
        </td>`,
  );

  // Two rows of three rather than one <table> per product -- table-based
  // layout, same as ctaButton's own reasoning, for the mail clients (Outlook
  // desktop chief among them) that ignore flexbox/grid entirely.
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 3) {
    rows.push(`<tr>${cells.slice(i, i + 3).join('')}</tr>`);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">${rows.join('')}</table>`;
}

async function sendWelcomeEmail(
  email: EmailSenderService,
  customer: { firstName: string; email: string },
  products: FeaturedProduct[],
) {
  const origin = storefrontOrigin();
  const firstName = customer.firstName.trim() || 'there';

  return email.send({
    to: customer.email,
    subject: 'Shop Drip Emporium on the web now',
    html: `<h2>Hi ${escapeHtml(firstName)}, you can now shop on our website</h2>
      <p>We've moved to a new, faster storefront at
        <a href="${escapeHtml(origin)}">${escapeHtml(origin.replace(/^https?:\/\//, ''))}</a> --
        browse the full range, check real-time stock and sizes, and check out
        online or arrange delivery, all from your browser.</p>
      <p>Here's a few things worth a look:</p>
      ${productGridHtml(products)}
      ${ctaButton(`${origin}/shop`, 'Start shopping')}
      <p>Any questions on sizing or an order, message us on WhatsApp any time --
        we're glad to help.</p>`,
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const app = initializeApp({
    credential: cert(require(SERVICE_ACCOUNT_PATH!)),
  });
  const firestore = getFirestore(app);

  const appContext = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = appContext.get(PrismaService);
  const emailSender = appContext.get(EmailSenderService);

  try {
    if (dryRun) console.log('--- DRY RUN: no Customer rows will be created, no email will be sent ---\n');

    console.log('Reading Firestore users collection...');
    const snapshot = await firestore.collection('users').get();
    console.log(`Found ${snapshot.size} Firestore user documents.`);

    // One query up front, not one findUnique per row -- avoids N a Firestore
    // batch of any real size would otherwise cost.
    const existingEmails = new Set(
      (await prisma.customer.findMany({ select: { email: true } })).map((row) => row.email.toLowerCase()),
    );

    let created = 0;
    let skippedExisting = 0;
    let skippedNoEmail = 0;
    let emailFailures = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const rawEmail = String(data.email || '').trim().toLowerCase();

      if (!rawEmail || !rawEmail.includes('@')) {
        skippedNoEmail++;
        continue;
      }
      if (existingEmails.has(rawEmail)) {
        skippedExisting++;
        continue;
      }

      if (dryRun) {
        const { firstName, lastName } = splitName(data.displayName, rawEmail);
        console.log(`  Would create: ${firstName} ${lastName.trim()} <${rawEmail}>`);
        existingEmails.add(rawEmail); // mirrors the real run's de-dup within this batch
        created++;
        continue;
      }

      const { firstName, lastName } = splitName(data.displayName, rawEmail);
      const phone = normalisePhone(data.mobileNumber);

      const customer = await prisma.customer.create({
        data: {
          firstName,
          lastName,
          email: rawEmail,
          phone,
          // portalEnabled stays false (the model default) -- migrated
          // customers get a record, not a login, until they sign up fresh
          // or staff explicitly grant portal access.
        },
      });
      existingEmails.add(rawEmail);
      created++;

      const products = await pickRandomProducts(prisma, 6);
      const result = await sendWelcomeEmail(emailSender, { firstName, email: rawEmail }, products);
      if (!result.delivered) {
        emailFailures++;
        console.warn(`Welcome email to ${rawEmail} (customer ${customer.id}) failed: ${result.error}`);
      }
    }

    console.log(`\n${dryRun ? 'Dry run' : 'Migration'} complete.`);
    console.log(`  ${dryRun ? 'Would create' : 'Created'}:            ${created}`);
    console.log(`  Skipped (existing): ${skippedExisting}`);
    console.log(`  Skipped (no email): ${skippedNoEmail}`);
    if (!dryRun) console.log(`  Email failures:     ${emailFailures}`);
  } finally {
    await appContext.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
