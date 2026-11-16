import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MauticService } from '../mautic/mautic.service';
import { realEmail } from '../common/contact-email';
import { DupCustomer, DupGroup, adoptFrom, groupDuplicates } from './customer-duplicates.rules';

export type MergeCounts = Record<'orders' | 'referredOrders' | 'invoices' | 'receipts' | 'consignments' | 'cartLeads' | 'referredCartLeads' | 'whatsappMessages' | 'documents' | 'shares' | 'favorites' | 'favoritesAlreadyHad', number>;

const emptyCounts = (): MergeCounts => ({ orders: 0, referredOrders: 0, invoices: 0, receipts: 0, consignments: 0, cartLeads: 0, referredCartLeads: 0, whatsappMessages: 0, documents: 0, shares: 0, favorites: 0, favoritesAlreadyHad: 0 });

/**
 * Merges customers who are the same person into one record: everything the others own (orders, invoices, receipts, carts, documents, favourites, WhatsApp
 * history) moves to the one kept, the others are removed, and a CustomerMerge row keeps what each one was. All of it in one transaction, so a merge
 * either happens whole or not at all. See customer-duplicates.rules.ts for what counts as a duplicate and which are safe.
 *
 * Nothing runs by itself: staff look at the groups and press the button. Reseller and wholesale accounts are never touched.
 */
@Injectable()
export class CustomerMergeService {
  private readonly logger = new Logger(CustomerMergeService.name);

  constructor(private readonly prisma: PrismaService, private readonly mautic: MauticService) {}

  private async load(client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const rows = await client.customer.findMany({
      where: { isActive: true, priceTier: 'RETAIL', referralCode: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true, priceTier: true, referralCode: true, portalEnabled: true, portalPassword: true, createdAt: true, location: true, notes: true },
    });
    const orders = await client.order.groupBy({ by: ['customerId'], where: { customerId: { in: rows.map((r) => r.id) } }, _count: { _all: true }, _max: { placedAt: true } });
    const byCustomer = new Map(orders.map((o) => [o.customerId, o]));
    return rows.map((r): DupCustomer & { location: string | null; notes: string | null } => ({
      id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone, isActive: r.isActive, priceTier: r.priceTier, referralCode: r.referralCode,
      portalEnabled: r.portalEnabled, hasPassword: Boolean(r.portalPassword), createdAt: r.createdAt, location: r.location, notes: r.notes,
      orders: byCustomer.get(r.id)?._count._all ?? 0, lastOrderAt: byCustomer.get(r.id)?._max.placedAt ?? null,
    }));
  }

  /** Every group of customers who look like the same person, with the record to keep and whether the group is safe to merge as it is. */
  async groups(): Promise<{ groups: DupGroup[]; summary: { groups: number; safe: number; needsReview: number; extraRecords: number } }> {
    const groups = groupDuplicates(await this.load());
    return {
      groups,
      summary: { groups: groups.length, safe: groups.filter((g) => g.safe).length, needsReview: groups.filter((g) => !g.safe).length, extraRecords: groups.reduce((n, g) => n + g.members.length - 1, 0) },
    };
  }

  /** Checks a merge can go ahead and says what it would do, changing nothing. */
  async preview(keepId: string, mergeIds: string[]) {
    return this.plan(this.prisma, keepId, mergeIds);
  }

  private async plan(client: Prisma.TransactionClient | PrismaService, keepId: string, mergeIds: string[]) {
    const ids = [...new Set(mergeIds)];
    if (!keepId || ids.length === 0) throw new BadRequestException('Choose the customer to keep and at least one to merge into it.');
    if (ids.includes(keepId)) throw new BadRequestException('A customer cannot be merged into itself.');
    const all = await this.load(client);
    const byId = new Map(all.map((c) => [c.id, c]));
    const keep = byId.get(keepId);
    const others = ids.map((id) => byId.get(id));
    if (!keep || others.some((o) => !o)) throw new BadRequestException('One of those customers is not an active retail customer, or no longer exists. Reseller and wholesale accounts cannot be merged here.');

    // A shopper who is also a trade referrer has money and links hanging off them that this does not move. Refuse rather than guess.
    const trade = await Promise.all([
      client.commission.count({ where: { resellerId: { in: ids } } }),
      client.resellerPayout.count({ where: { resellerId: { in: ids } } }),
      client.referralClick.count({ where: { resellerId: { in: ids } } }),
      client.whatsAppClick.count({ where: { resellerId: { in: ids } } }),
      client.resellerApplication.count({ where: { customerId: { in: ids } } }),
    ]);
    if (trade.some((n) => n > 0)) throw new BadRequestException('One of those customers has reseller activity (commission, payouts, referral links or an application). Merge those by hand.');

    const adopt = adoptFrom(keep, others as Array<NonNullable<(typeof others)[number]>>);
    return { keep: keep, merging: others as Array<NonNullable<(typeof others)[number]>>, adopt, ordersMoved: others.reduce((n, o) => n + (o?.orders ?? 0), 0) };
  }

  /** Merges the listed customers into the one to keep. Returns what moved. */
  async merge(keepId: string, mergeIds: string[], actor: string) {
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const { keep, merging, adopt } = await this.plan(tx, keepId, mergeIds);
        const totals = emptyCounts();

        for (const dup of merging) {
          const moved = emptyCounts();
          const own = { where: { customerId: dup.id }, data: { customerId: keep.id } };
          moved.orders = (await tx.order.updateMany(own)).count;
          moved.referredOrders = (await tx.order.updateMany({ where: { referredByCustomerId: dup.id }, data: { referredByCustomerId: keep.id } })).count;
          moved.invoices = (await tx.invoice.updateMany(own)).count;
          moved.receipts = (await tx.receipt.updateMany(own)).count;
          moved.consignments = (await tx.consignment.updateMany(own)).count;
          moved.cartLeads = (await tx.cartLead.updateMany(own)).count;
          moved.referredCartLeads = (await tx.cartLead.updateMany({ where: { referredByCustomerId: dup.id }, data: { referredByCustomerId: keep.id } })).count;
          moved.whatsappMessages = (await tx.whatsappOutreach.updateMany(own)).count;
          moved.documents = (await tx.customerDocument.updateMany(own)).count;
          // Their share history goes with them, so an affiliate's counts do not shrink when a duplicate record is merged into theirs.
          moved.shares = (await tx.shareEvent.updateMany(own)).count;

          // A favourite is one row per customer and product: move the ones the kept customer does not have, drop the repeats.
          const have = new Set((await tx.favorite.findMany({ where: { customerId: keep.id }, select: { productId: true } })).map((f) => f.productId));
          const theirs = await tx.favorite.findMany({ where: { customerId: dup.id }, select: { id: true, productId: true } });
          const repeats = theirs.filter((f) => have.has(f.productId));
          if (repeats.length) await tx.favorite.deleteMany({ where: { id: { in: repeats.map((f) => f.id) } } });
          moved.favoritesAlreadyHad = repeats.length;
          moved.favorites = (await tx.favorite.updateMany(own)).count;

          const row = await tx.customer.findUniqueOrThrow({ where: { id: dup.id } });
          const { portalPassword, resetTokenHash, resetTokenExpiresAt, ...snapshot } = row;
          await tx.customerMerge.create({
            data: { keptCustomerId: keep.id, mergedCustomerId: dup.id, mergedSnapshot: { ...snapshot, hadPortalPassword: Boolean(portalPassword) } as unknown as Prisma.InputJsonValue, moved: moved as unknown as Prisma.InputJsonValue, mergedBy: actor },
          });
          for (const k of Object.keys(moved) as Array<keyof MergeCounts>) totals[k] += moved[k];
        }

        // Only now are the others gone, so an email the kept record adopts is free to take.
        const takeFrom = adopt.takePortalFrom ? await tx.customer.findUnique({ where: { id: adopt.takePortalFrom }, select: { portalPassword: true, portalEnabled: true, portalLastLoginAt: true } }) : null;
        await tx.customer.deleteMany({ where: { id: { in: merging.map((m) => m.id) } } });
        const { takePortalFrom, ...fields } = adopt;
        if (Object.keys(fields).length || takeFrom) {
          await tx.customer.update({
            where: { id: keep.id },
            data: { ...fields, ...(takeFrom ? { portalPassword: takeFrom.portalPassword, portalEnabled: takeFrom.portalEnabled, portalLastLoginAt: takeFrom.portalLastLoginAt } : {}) },
          });
        }
        return { keep, merged: merging.length, moved: totals, adopted: Object.keys(adopt) };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // Mautic: the kept customer may now have an email (or a phone-only contact to upgrade). Best effort: it never throws and never undoes the merge.
    const now = await this.prisma.customer.findUnique({ where: { id: keepId }, select: { email: true, phone: true, firstName: true, lastName: true } });
    if (now && realEmail(now.email)) void this.mautic.syncContact({ email: now.email, phone: now.phone, firstName: now.firstName, lastName: now.lastName }).catch(() => undefined);

    this.logger.log(`Merged ${outcome.merged} customer(s) into ${keepId} (${actor}): ${JSON.stringify(outcome.moved)}`);
    return outcome;
  }

  /**
   * Merges every group that is safe, as the screen showed it: `keepIds` are the records staff saw being kept. A group that has changed since (it
   * is no longer safe, or the record to keep is different) is left alone, so what is merged is what was shown.
   */
  async mergeSafe(keepIds: string[], actor: string) {
    const wanted = new Set(keepIds);
    const { groups } = await this.groups();
    let merged = 0;
    let groupsMerged = 0;
    const skipped: Array<{ keepId: string; reason: string }> = [];
    for (const g of groups) {
      if (!wanted.has(g.keepId)) continue;
      wanted.delete(g.keepId);
      if (!g.safe) { skipped.push({ keepId: g.keepId, reason: g.caution ?? 'No longer safe to merge' }); continue; }
      try {
        const out = await this.merge(g.keepId, g.members.filter((m) => m.id !== g.keepId).map((m) => m.id), actor);
        merged += out.merged;
        groupsMerged += 1;
      } catch (error) {
        skipped.push({ keepId: g.keepId, reason: (error as Error).message });
      }
    }
    for (const id of wanted) skipped.push({ keepId: id, reason: 'No longer a duplicate group' });
    return { groupsMerged, customersMerged: merged, skipped };
  }
}
