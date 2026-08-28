import { randomBytes } from 'crypto';
import { PriceTier } from '@prisma/client';

/**
 * A short, URL-safe, unguessable public identifier -- for a referral code,
 * not a credential. Unlike the password-reset token
 * (customer-portal.service.ts), this is meant to be read back verbatim and
 * handed to strangers, so it is never hashed before storage: hashing a value
 * with no secrecy requirement only adds a lookup step for no benefit. 8
 * random bytes is plenty against guessing and short enough to sit cleanly in
 * a URL query param.
 */
export function generatePublicCode(byteLength = 8): string {
  return randomBytes(byteLength).toString('base64url');
}

type CustomerCodeClient = {
  customer: {
    update: (args: {
      where: { id: string };
      data: { referralCode: string };
      select: { referralCode: true };
    }) => Promise<{ referralCode: string | null }>;
  };
};

/**
 * Backfills a referral code the first time a RESELLER/WHOLESALE customer
 * needs one -- never for RETAIL, so an ordinary signup never mints a code
 * nobody will use. Idempotent: returns the existing code if already set.
 * Retried on the vanishing chance of a collision, the same way order numbers
 * are -- the unique index is the real arbiter, not the odds.
 */
export async function ensureReferralCode(
  prisma: CustomerCodeClient,
  customer: { id: string; priceTier: PriceTier; referralCode: string | null },
): Promise<string | null> {
  if (customer.priceTier === 'RETAIL') return null;
  if (customer.referralCode) return customer.referralCode;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: { referralCode: generatePublicCode() },
        select: { referralCode: true },
      });
      return updated.referralCode;
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error; // unique clash: retry
    }
  }
  return null;
}
