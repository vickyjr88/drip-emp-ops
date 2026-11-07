import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { PageContentService } from '../page-content/page-content.service';
import { containsAny, paginate, searchOr } from '../common/pagination.util';
import {
  DEFAULT_APP_URL,
  KIND_LABELS,
  OUTREACH_KINDS,
  greetingName,
  safeUrl,
  templateFor,
  hasVariables,
  type OutreachKind,
} from './whatsapp-outreach.kinds';

export type OutreachResult = {
  customerId: string;
  name: string;
  phone: string | null;
  outcome: 'SENT' | 'FAILED' | 'SKIPPED';
  detail?: string;
};

const MAX_UNSENT_IDS = 1000;
/** A short pause between sends keeps a batch well inside the API's rate limits and its request time bounded. */
const PAUSE_MS = 150;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Manual WhatsApp outreach: staff pick customers and one of three approved templates, and this sends it through the
 * Cloud API. A customer who already received a given message is skipped unless the caller forces it.
 */
@Injectable()
export class WhatsAppOutreachService {
  private readonly logger = new Logger(WhatsAppOutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly pages: PageContentService,
  ) {}

  /**
   * The link each message carries. The group and review links are the ones edited under Site content > Footer. They are
   * read the way the website reads them, with the built-in defaults filling anything not yet edited: the live footer
   * shows the default links, so the messages must carry the same ones.
   */
  private async links(): Promise<Record<OutreachKind, string | null>> {
    const footer = await this.pages.findOne('footer');
    const community = ((footer.content as any)?.community ?? {}) as Record<string, unknown>;
    return {
      APP: safeUrl(process.env.APP_DOWNLOAD_URL) ?? DEFAULT_APP_URL,
      GROUP: safeUrl(community.whatsappGroupUrl),
      REVIEW: safeUrl(community.googleProfileUrl),
      // Fixed-text templates carry their own link or number inside the approved text.
      GOOGLE_REVIEW: null,
      SHOE_RANGE: null,
      LOCATION: null,
    };
  }

  async status() {
    const links = await this.links();
    return {
      configured: this.whatsapp.isConfigured,
      kinds: OUTREACH_KINDS.map((kind) => ({
        kind,
        label: KIND_LABELS[kind],
        template: templateFor(kind),
        link: links[kind],
        // A fixed-text template needs nothing from the site content, so it is always ready.
        linkReady: hasVariables(kind) ? Boolean(links[kind]) : true,
        fixedText: !hasVariables(kind),
      })),
    };
  }

  /** Customers with a phone number, each with when they last received each message. */
  async recipients(query: { skip?: number; take?: number; search?: string }) {
    const where: Prisma.CustomerWhereInput = {
      isActive: true,
      phone: { not: '' },
      ...searchOr(query.search, (term) => containsAny(['firstName', 'lastName', 'email', 'phone'], term)),
    };
    const page = await paginate(
      (args) =>
        this.prisma.customer.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
          ...args,
        }),
      () => this.prisma.customer.count({ where }),
      query.skip,
      query.take,
    );

    const sent = await this.prisma.whatsappOutreach.groupBy({
      by: ['customerId', 'kind'],
      where: { customerId: { in: page.items.map((c) => c.id) }, status: 'SENT' },
      _max: { createdAt: true },
    });
    const lastSent = new Map<string, Partial<Record<OutreachKind, Date>>>();
    for (const row of sent) {
      if (!row.customerId || !row._max.createdAt) continue;
      const entry = lastSent.get(row.customerId) ?? {};
      entry[row.kind as OutreachKind] = row._max.createdAt;
      lastSent.set(row.customerId, entry);
    }
    return { ...page, items: page.items.map((c) => ({ ...c, sent: lastSent.get(c.id) ?? {} })) };
  }

  /** Every matching customer who has not yet received `kind`, so staff can message "everyone who hasn't had it". */
  async unsentIds(kind: OutreachKind, search?: string) {
    const where: Prisma.CustomerWhereInput = {
      isActive: true,
      phone: { not: '' },
      whatsappOutreach: { none: { kind, status: 'SENT' } },
      ...searchOr(search, (term) => containsAny(['firstName', 'lastName', 'email', 'phone'], term)),
    };
    const rows = await this.prisma.customer.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
      take: MAX_UNSENT_IDS,
    });
    return { ids: rows.map((r) => r.id), capped: rows.length === MAX_UNSENT_IDS };
  }

  async send(params: { kind: OutreachKind; customerIds: string[]; force?: boolean; triggeredBy: string }): Promise<{ sent: number; failed: number; skipped: number; results: OutreachResult[] }> {
    if (!this.whatsapp.isConfigured) throw new BadRequestException('WhatsApp is not configured on this server (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).');
    const link = (await this.links())[params.kind];
    if (hasVariables(params.kind) && !link) {
      throw new BadRequestException(
        `There is no link for "${KIND_LABELS[params.kind]}" yet. Add it in Site content > Footer > Google reviews and WhatsApp group.`,
      );
    }
    const template = templateFor(params.kind);
    const ids = [...new Set(params.customerIds)];
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, phone: true, isActive: true },
    });
    const byId = new Map(customers.map((c) => [c.id, c]));
    const already = params.force
      ? new Set<string>()
      : new Set(
          (
            await this.prisma.whatsappOutreach.findMany({
              where: { customerId: { in: ids }, kind: params.kind, status: 'SENT' },
              select: { customerId: true },
            })
          ).map((r) => r.customerId as string),
        );

    const results: OutreachResult[] = [];
    for (const id of ids) {
      const customer = byId.get(id);
      if (!customer) {
        results.push({ customerId: id, name: 'Unknown customer', phone: null, outcome: 'SKIPPED', detail: 'Customer not found' });
        continue;
      }
      const name = `${customer.firstName} ${customer.lastName}`.trim();
      const phone = this.whatsapp.normalisePhone(customer.phone);
      if (!customer.isActive) {
        results.push({ customerId: id, name, phone: customer.phone, outcome: 'SKIPPED', detail: 'Customer is inactive' });
        continue;
      }
      if (!phone) {
        results.push({ customerId: id, name, phone: customer.phone, outcome: 'SKIPPED', detail: 'No usable phone number' });
        continue;
      }
      if (already.has(id)) {
        results.push({ customerId: id, name, phone, outcome: 'SKIPPED', detail: 'Already sent' });
        continue;
      }

      const outcome = await this.whatsapp.sendTemplate(phone, hasVariables(params.kind) ? [greetingName(customer.firstName), link as string] : [], template);
      await this.prisma.whatsappOutreach
        .create({
          data: {
            customerId: id,
            phone,
            kind: params.kind,
            template,
            status: outcome.delivered ? 'SENT' : 'FAILED',
            messageId: outcome.messageId,
            error: outcome.error?.slice(0, 500),
            triggeredBy: params.triggeredBy,
          },
        })
        .catch((error) => this.logger.warn(`Could not record outreach to ${phone}: ${error instanceof Error ? error.message : error}`));
      results.push({ customerId: id, name, phone, outcome: outcome.delivered ? 'SENT' : 'FAILED', detail: outcome.error });
      await sleep(PAUSE_MS);
    }

    const count = (outcome: OutreachResult['outcome']) => results.filter((r) => r.outcome === outcome).length;
    return { sent: count('SENT'), failed: count('FAILED'), skipped: count('SKIPPED'), results };
  }

  /**
   * One message for one Mautic contact, found by email. Only people with a customer record are messaged: the welcome
   * campaign also holds cart leads and inquirers who never signed up, and they are not part of this sequence.
   */
  async sendForContact(params: { kind: OutreachKind; email: string }): Promise<OutreachResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { email: { equals: params.email.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (!customer) {
      return { customerId: '', name: params.email, phone: null, outcome: 'SKIPPED', detail: 'Not a customer' };
    }
    const out = await this.send({ kind: params.kind, customerIds: [customer.id], triggeredBy: 'mautic' });
    return out.results[0];
  }

  history(query: { skip?: number; take?: number }) {
    return paginate(
      (args) =>
        this.prisma.whatsappOutreach.findMany({
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { firstName: true, lastName: true } } },
          ...args,
        }),
      () => this.prisma.whatsappOutreach.count(),
      query.skip,
      query.take,
    );
  }
}
