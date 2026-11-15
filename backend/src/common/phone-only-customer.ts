import { Prisma, PrismaClient } from '@prisma/client';
import { PLACEHOLDER_EMAIL_DOMAIN, phoneTail } from './contact-email';

/**
 * The customer record for a phone number nobody has given an email for: the one made when a shopper checked out with a phone alone, or a walk-in
 * rung up at the counter. Found by the last nine digits, so 0722..., +254722... and 254722... are the same person. Only retail records: a trade
 * account is never merged into a shopper by a phone number. Works inside a transaction or outside one.
 */
export function findPhoneOnlyCustomer(client: Prisma.TransactionClient | PrismaClient, phone: string) {
  const tail = phoneTail(phone);
  if (tail.length < 7) return Promise.resolve(null);
  return client.customer.findFirst({
    where: { phone: { contains: tail }, email: { endsWith: `@${PLACEHOLDER_EMAIL_DOMAIN}` }, priceTier: 'RETAIL', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}
