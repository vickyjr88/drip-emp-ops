import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { CartLeadFollowUp, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { EmailLogService } from '../email-log/email-log.service';
import { EmailSenderService } from '../email-log/email-sender.service';
import { realEmail } from '../common/contact-email';
import { withFirstLineImage } from '../common/cart-lead-image.util';
import { storefrontOrigin } from '../common/storefront-origin';
import { startOfNairobiDay } from '../whatsapp-outreach/whatsapp-subscription';
import {
  EMAIL_KIND, EmailAttempt, FollowUpConfig, FollowUpKind, WhatsappAttempt, canSendNow, classifyFailure, decide, dueAt, errorCodeOf, followUpConfig,
  itemsSummary, nextWindowOpens, outreachKindFor, resolveOutcome, utmLink, whatsappParams,
} from './lead-followup';
import { leadFollowUpEmail } from './lead-followup-email';

const TICK_MS = 5 * 60_000;
/** A lead claimed but not finished (a crash) is picked up again after this long. */
const LEASE_MS = 20 * 60_000;
const DAY_MS = 86_400_000;
/** A short pause between WhatsApp sends keeps a run well inside the API's rate limits. */
const PAUSE_BETWEEN_MS = 1_200;
/** Someone who wrote to the shop a little before the lead was recorded (they asked, then went to the cart) already has a conversation. */
const CONVERSATION_SLACK_MS = 15 * 60_000;
/** How long after sending a delivery report is still looked for. */
const RECONCILE_MS = 3 * DAY_MS;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const leadInclude = { customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } satisfies Prisma.CartLeadInclude;
type Lead = Prisma.CartLeadGetPayload<{ include: typeof leadInclude }>;

export type TickResult = { sent: number; emailed: number; closed: number; deferred: number; retrying: number; paused: string | null };

/**
 * Follows up leads and abandoned carts on its own: about an hour after the shopper last did anything, by email and by WhatsApp, between 08:00
 * and 20:00 Nairobi time, unless they have already opened a WhatsApp conversation with the shop. It also works through the backlog of the last
 * thirty days, newest first, a few at a time, inside the same window and the same daily cap.
 *
 * Every lead ends up marked (done, failed, skipped, with the reason) and every email goes through the email log. A number that is not on
 * WhatsApp is marked as such; a problem with the shop's own account or template pauses the run instead of marking customers as unreachable.
 *
 * Checked every five minutes, so a restart or a deploy loses nothing. Both backend slots run it; that is safe because a lead is claimed in the
 * database before anything is sent, so only one slot works on it. LEAD_FOLLOWUP_ENABLED=false switches it off everywhere.
 */
@Injectable()
export class LeadFollowUpService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LeadFollowUpService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private running = false;
  private pausedUntil: Date | null = null;
  private pausedFor: string | null = null;
  private lastTick: { at: Date; result: TickResult } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly emailLog: EmailLogService,
    private readonly sender: EmailSenderService,
  ) {}

  onApplicationBootstrap() {
    if (!followUpConfig().enabled) {
      this.logger.log('LEAD_FOLLOWUP_ENABLED=false: leads are not followed up automatically.');
      return;
    }
    this.first = setTimeout(() => void this.safeTick(), 90_000);
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`Lead follow-up run failed: ${(error as Error).message}`);
    }
  }

  // --- the run --------------------------------------------------------------------------------------------------------

  async tick(now: Date = new Date()): Promise<TickResult> {
    const result: TickResult = { sent: 0, emailed: 0, closed: 0, deferred: 0, retrying: 0, paused: null };
    const cfg = followUpConfig();
    if (!cfg.enabled || this.running) return result;
    this.running = true;
    try {
      // Marking costs nothing and sends nothing, so it happens at any hour.
      await this.sweep(now, cfg);
      await this.reconcile(now, cfg);

      if (!canSendNow(now)) return result;
      if (this.pausedUntil && now < this.pausedUntil) { result.paused = this.pausedFor; return result; }
      this.pausedUntil = null; this.pausedFor = null;

      const cap = Number(process.env.WHATSAPP_DAILY_SEND_CAP || 200) + cfg.reserve;
      const budget = { sentToday: await this.sentToday(now), cap };

      const leads = await this.prisma.cartLead.findMany({
        where: this.dueWhere(now, cfg),
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
        take: cfg.batch,
        include: leadInclude,
      });

      for (const lead of leads) {
        if (this.pausedUntil) break;
        try {
          const outcome = await this.handle(lead, now, cfg, budget);
          if (outcome.sent) result.sent += 1;
          if (outcome.emailed) result.emailed += 1;
          if (outcome.closed) result.closed += 1;
          if (outcome.deferred) result.deferred += 1;
          if (outcome.retrying) result.retrying += 1;
          if (outcome.sent) await sleep(PAUSE_BETWEEN_MS);
        } catch (error) {
          this.logger.error(`Following up lead ${lead.id} failed: ${(error as Error).message}`);
          await this.release(lead.id);
        }
      }
      result.paused = this.pausedUntil ? this.pausedFor : null;
      if (result.sent || result.emailed || result.closed || result.paused) {
        this.logger.log(`Lead follow-up: ${result.sent} WhatsApp, ${result.emailed} email, ${result.closed} marked, ${result.retrying} to retry${result.paused ? `; paused: ${result.paused}` : ''}.`);
      }
      return result;
    } finally {
      this.lastTick = { at: now, result };
      this.running = false;
    }
  }

  /** Leads that are due: still pending, still open, an hour past their last activity and inside the backlog window, not waiting on a retry or claimed by another slot. */
  private dueWhere(now: Date, cfg: FollowUpConfig): Prisma.CartLeadWhereInput {
    return {
      followUpState: 'PENDING',
      status: { in: ['NEW', 'CONTACTED'] },
      lastActivityAt: { lte: new Date(now.getTime() - cfg.delayMs), gte: new Date(now.getTime() - cfg.maxAgeMs) },
      AND: [
        { OR: [{ followUpNextAt: null }, { followUpNextAt: { lte: now } }] },
        { OR: [{ followUpClaimedAt: null }, { followUpClaimedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] },
      ],
    };
  }

  private sentToday(now: Date) {
    return this.prisma.whatsappOutreach.count({ where: { status: 'SENT', createdAt: { gte: startOfNairobiDay(now) } } });
  }

  /** Marks what needs no sending: leads that became orders, were dismissed, were followed up by staff, or are too old. */
  private async sweep(now: Date, cfg: FollowUpConfig) {
    const mark = (where: Prisma.CartLeadWhereInput, reason: string, note: string, state: CartLeadFollowUp, by: string) =>
      this.prisma.cartLead.updateMany({ where: { followUpState: 'PENDING', ...where }, data: { followUpState: state, followUpReason: reason, followUpNote: note, followUpAt: now, followUpBy: by, followUpClaimedAt: null } });
    await mark({ status: 'CONVERTED' }, 'CLOSED', 'An order was placed', 'SKIPPED', 'auto');
    await mark({ status: 'EXPIRED' }, 'CLOSED', 'Dismissed by staff', 'SKIPPED', 'auto');
    await mark({ status: 'CONTACTED' }, 'STAFF', 'A member of staff followed this up', 'DONE', 'staff');
    await mark({ status: 'NEW', lastActivityAt: { lt: new Date(now.getTime() - cfg.maxAgeMs) } }, 'TOO_OLD', 'Too old to chase automatically', 'SKIPPED', 'auto');
  }

  /**
   * A message WhatsApp accepted is not a message that arrived: the failure report comes later. When it says the number cannot receive
   * WhatsApp, the lead is marked as such. When it says the shop's own account or template is the problem, nobody is marked: the lead goes
   * back to waiting and the message is sent again later.
   */
  private async reconcile(now: Date, cfg: FollowUpConfig) {
    const leads = await this.prisma.cartLead.findMany({
      where: { followUpWhatsapp: 'SENT', followUpWhatsappMessageId: { not: null }, followUpWhatsappAt: { gte: new Date(now.getTime() - RECONCILE_MS) } },
      take: 200,
    });
    if (!leads.length) return;
    const reports = await this.prisma.whatsappOutreach.findMany({
      where: { messageId: { in: leads.map((l) => l.followUpWhatsappMessageId as string) }, delivery: 'failed' },
      select: { messageId: true, deliveryError: true },
    });
    const failed = new Map(reports.map((r) => [r.messageId, r.deliveryError]));
    for (const lead of leads) {
      if (!failed.has(lead.followUpWhatsappMessageId as string)) continue;
      const error = failed.get(lead.followUpWhatsappMessageId as string) ?? null;
      const kind = classifyFailure(errorCodeOf(error), error);
      const emailed = lead.followUpEmail === 'SENT' || Boolean(lead.reminderSentAt);

      if (kind === 'NUMBER') {
        await this.prisma.cartLead.update({
          where: { id: lead.id },
          data: {
            followUpWhatsapp: 'FAILED',
            ...(emailed
              ? { followUpState: 'DONE', followUpReason: 'SENT', followUpNote: 'Followed up by email; the WhatsApp number could not be reached', followUpAt: now }
              : { followUpState: 'FAILED', followUpReason: 'WHATSAPP_FAILED', followUpNote: 'This number is not on WhatsApp and there is no email address that worked', followUpAt: now }),
          },
        });
      } else if (!emailed) {
        // Not the person's fault (or not known to be): back to waiting, without a WhatsApp mark.
        const account = kind === 'ACCOUNT' || kind === 'CONFIG';
        const attempts = account ? lead.followUpAttempts : lead.followUpAttempts + 1;
        const giveUp = !account && attempts >= cfg.maxAttempts;
        await this.prisma.cartLead.update({
          where: { id: lead.id },
          data: {
            followUpWhatsapp: null, followUpWhatsappMessageId: null, followUpAttempts: attempts,
            ...(giveUp
              ? { followUpState: 'FAILED', followUpReason: 'GAVE_UP', followUpNote: `WhatsApp reported the message as not delivered after ${cfg.maxAttempts} tries`, followUpAt: now }
              : { followUpState: 'PENDING', followUpReason: 'RETRY', followUpNote: 'WhatsApp reported the message as not delivered; will try again', followUpNextAt: new Date(now.getTime() + (account ? cfg.pauseMs : cfg.retryMs)) }),
          },
        });
      }
    }
  }

  // --- one lead -------------------------------------------------------------------------------------------------------

  private release(id: string) {
    return this.prisma.cartLead.updateMany({ where: { id }, data: { followUpClaimedAt: null } });
  }

  private kindOf(lead: Pick<Lead, 'source'>): FollowUpKind {
    return lead.source === 'WHATSAPP_ORDER' ? 'WHATSAPP_ORDER' : 'ABANDONED_CART';
  }

  private contactOf(lead: Lead) {
    return {
      phone: this.whatsapp.normalisePhone(lead.customerPhone ?? lead.customer?.phone ?? ''),
      email: realEmail(lead.customerEmail) ?? realEmail(lead.customer?.email),
      name: lead.customerName ?? (lead.customer ? `${lead.customer.firstName} ${lead.customer.lastName}` : null),
    };
  }

  /** What is known about this person that decides how, or whether, to message them. */
  private async factsFor(lead: Lead, phone: string | null, email: string | null, now: Date) {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const [conversation, stopped, bad, samePhone, sameEmail] = await Promise.all([
      phone ? this.prisma.whatsappContact.findFirst({ where: { phone, lastMessageAt: { gte: new Date(lead.createdAt.getTime() - CONVERSATION_SLACK_MS) } }, select: { id: true } }) : null,
      phone ? this.prisma.whatsappContact.findFirst({ where: { phone, subscribed: false, unsubscribedReason: 'STOP' }, select: { id: true } }) : null,
      phone ? this.prisma.whatsappOutreach.findFirst({ where: { phone, delivery: 'failed', OR: [{ deliveryError: { startsWith: '131026' } }, { deliveryError: { startsWith: '131021' } }] }, select: { id: true } }) : null,
      phone ? this.prisma.whatsappOutreach.findFirst({ where: { phone, kind: { startsWith: 'FOLLOWUP' }, status: 'SENT', createdAt: { gte: dayAgo } }, select: { id: true } }) : null,
      email ? this.prisma.emailLog.findFirst({ where: { recipient: email, kind: EMAIL_KIND, status: 'SENT', sentAt: { gte: dayAgo } }, select: { id: true } }) : null,
    ]);
    return { conversation: Boolean(conversation), stopped: Boolean(stopped), badNumber: Boolean(bad), sameNumberRecently: Boolean(samePhone), sameEmailRecently: Boolean(sameEmail) };
  }

  private decisionFor(lead: Lead, contact: { phone: string | null; email: string | null }, facts: Awaited<ReturnType<LeadFollowUpService['factsFor']>>, now: Date, cfg: FollowUpConfig) {
    return decide({
      now,
      lead: {
        status: lead.status, state: lead.followUpState, createdAt: lead.createdAt, lastActivityAt: lead.lastActivityAt, nextAt: lead.followUpNextAt,
        emailAttempts: lead.followUpEmailAttempts,
        whatsapp: (lead.followUpWhatsapp as 'SENT' | 'FAILED' | 'CONVERSATION' | null) ?? null,
        email: (lead.followUpEmail as 'SENT' | 'FAILED' | null) ?? null,
        reminderSentAt: lead.reminderSentAt,
      },
      phone: contact.phone, email: contact.email, facts,
      channels: { whatsappReady: this.whatsapp.isConfigured, emailReady: this.sender.isConfigured },
      config: cfg,
    });
  }

  private async handle(lead: Lead, now: Date, cfg: FollowUpConfig, budget: { sentToday: number; cap: number }) {
    const outcome = { sent: false, emailed: false, closed: false, deferred: false, retrying: false };

    // Take the lead before doing anything with it: only one slot gets count 1.
    const claimed = await this.prisma.cartLead.updateMany({
      where: { id: lead.id, followUpState: 'PENDING', OR: [{ followUpClaimedAt: null }, { followUpClaimedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] },
      data: { followUpClaimedAt: now },
    });
    if (claimed.count !== 1) return outcome;

    const contact = this.contactOf(lead);
    const facts = await this.factsFor(lead, contact.phone, contact.email, now);
    const decision = this.decisionFor(lead, contact, facts, now, cfg);

    if (decision.action === 'WAIT') {
      await this.release(lead.id);
      outcome.deferred = true;
      return outcome;
    }
    if (decision.action === 'CLOSE') {
      await this.mark(lead.id, decision.state, decision.reason, decision.note, 'auto', now, facts.conversation ? { followUpWhatsapp: 'CONVERSATION' } : {});
      outcome.closed = true;
      return outcome;
    }

    // Both channels go together or not at all: when WhatsApp is wanted but today's cap is spent, the lead waits for tomorrow rather than being
    // marked done on email alone and never getting the WhatsApp message.
    if (decision.whatsapp && budget.sentToday >= budget.cap) {
      await this.release(lead.id);
      outcome.deferred = true;
      return outcome;
    }

    const kind = this.kindOf(lead);
    const [resolved] = await withFirstLineImage(this.prisma, [lead]);
    const lines = (resolved.lines ?? []) as Array<{ name?: string; size?: string; quantity?: number; priceKes?: number; path: string | null }>;
    const firstPath = lines.find((l) => l.path)?.path ?? null;
    const origin = storefrontOrigin();

    let wa: WhatsappAttempt = 'NONE';
    let messageId: string | undefined;
    if (decision.whatsapp && contact.phone) {
      const sent = await this.sendWhatsapp(lead, kind, contact, lines, utmLink(origin, firstPath, kind, 'whatsapp'));
      if (sent.paused) {
        // The shop's account or template, not this customer: leave the lead as it was, send nothing on either channel, and stop the run.
        await this.release(lead.id);
        this.pause(now, sent.paused.kind === 'CONFIG' ? cfg.configPauseMs : cfg.pauseMs, sent.paused.reason);
        outcome.deferred = true;
        return outcome;
      }
      wa = sent.attempt;
      messageId = sent.messageId;
      if (wa === 'SENT') { budget.sentToday += 1; outcome.sent = true; }
    }

    let email: EmailAttempt = 'NONE';
    if (decision.email && contact.email) {
      const { subject, html } = leadFollowUpEmail({
        kind, name: contact.name, total: Number(lead.total),
        lines: lines.map((l) => ({ name: l.name, size: l.size, quantity: l.quantity, priceKes: l.priceKes })),
        link: utmLink(origin, firstPath, kind, 'email'),
      });
      // Through the email log, so every follow-up email is recorded: who, when, whether it went, and why not.
      const log = await this.emailLog.send({ recipient: contact.email, subject, html, kind: EMAIL_KIND, cartLeadId: lead.id });
      email = log.status === 'SENT' ? 'SENT' : 'FAILED';
      if (email === 'SENT') outcome.emailed = true;
    }

    const resolution = resolveOutcome({
      whatsapp: wa, email,
      priorWhatsapp: (lead.followUpWhatsapp as 'SENT' | 'FAILED' | 'CONVERSATION' | null) ?? null,
      priorEmailSent: lead.followUpEmail === 'SENT' || Boolean(lead.reminderSentAt),
      attempts: lead.followUpAttempts, emailAttempts: lead.followUpEmailAttempts + (email === 'NONE' ? 0 : 1),
      hadEmailAddress: Boolean(contact.email), maxAttempts: cfg.maxAttempts,
    });

    await this.prisma.cartLead.update({
      where: { id: lead.id },
      data: {
        followUpState: resolution.state, followUpReason: resolution.reason, followUpNote: resolution.note, followUpBy: 'auto',
        followUpAt: resolution.state === 'PENDING' ? lead.followUpAt : now,
        followUpAttempts: { increment: 1 },
        followUpNextAt: resolution.retry ? new Date(now.getTime() + cfg.retryMs) : null,
        followUpClaimedAt: null,
        ...(wa === 'SENT' ? { followUpWhatsapp: 'SENT', followUpWhatsappAt: now, followUpWhatsappMessageId: messageId ?? null } : {}),
        ...(wa === 'NUMBER' ? { followUpWhatsapp: 'FAILED', followUpWhatsappAt: now } : {}),
        ...(email !== 'NONE' ? { followUpEmail: email, followUpEmailAt: now, followUpEmailAttempts: { increment: 1 } } : {}),
        // The older 24-hour reminder reads this to know an email already went.
        ...(email === 'SENT' ? { reminderSentAt: now } : {}),
      },
    });
    if (resolution.state === 'PENDING') outcome.retrying = true; else outcome.closed = true;
    return outcome;
  }

  /** The template message. Always recorded in the outreach log, with Meta's reason when it was refused. */
  private async sendWhatsapp(
    lead: Lead, kind: FollowUpKind, contact: { phone: string | null; name: string | null }, lines: Array<{ name?: string; size?: string }>, link: string,
  ): Promise<{ attempt: WhatsappAttempt; messageId?: string; paused?: { reason: string; kind: 'ACCOUNT' | 'CONFIG' } }> {
    const phone = contact.phone as string;
    const template = kind === 'WHATSAPP_ORDER'
      ? process.env.WHATSAPP_TEMPLATE_ORDER_FOLLOWUP || 'drip_order_followup'
      : process.env.WHATSAPP_TEMPLATE_CART_FOLLOWUP || 'drip_cart_followup';
    const result = await this.whatsapp.sendTemplate(phone, whatsappParams({ name: contact.name, items: itemsSummary(lines), link }), template);
    await this.prisma.whatsappOutreach
      .create({
        data: {
          customerId: lead.customerId ?? undefined, phone, kind: outreachKindFor(kind), template,
          status: result.delivered ? 'SENT' : 'FAILED', messageId: result.messageId, error: result.error?.slice(0, 500), triggeredBy: 'lead-followup',
        },
      })
      .catch((error) => this.logger.warn(`Could not record the follow-up to ${phone}: ${error instanceof Error ? error.message : error}`));

    if (result.delivered) return { attempt: 'SENT', messageId: result.messageId };
    const failure = classifyFailure(result.errorCode, result.error);
    if (failure === 'NUMBER') return { attempt: 'NUMBER' };
    if (failure === 'ACCOUNT') return { attempt: 'NONE', paused: { kind: 'ACCOUNT', reason: `WhatsApp account problem: ${result.error ?? result.errorCode}` } };
    if (failure === 'CONFIG') return { attempt: 'NONE', paused: { kind: 'CONFIG', reason: `WhatsApp is not set up for follow-ups (${template}): ${result.error ?? result.errorCode}` } };
    return { attempt: 'RETRY' };
  }

  private pause(now: Date, forMs: number, reason: string) {
    this.pausedUntil = new Date(now.getTime() + forMs);
    this.pausedFor = reason;
    this.logger.error(`Lead follow-up paused until ${this.pausedUntil.toISOString()}: ${reason}`);
  }

  private mark(id: string, state: Exclude<CartLeadFollowUp, 'PENDING'>, reason: string, note: string, by: string, now: Date, extra: Prisma.CartLeadUpdateInput = {}) {
    return this.prisma.cartLead.update({
      where: { id },
      data: { followUpState: state, followUpReason: reason, followUpNote: note, followUpBy: by, followUpAt: now, followUpNextAt: null, followUpClaimedAt: null, ...extra },
    });
  }

  // --- staff ----------------------------------------------------------------------------------------------------------

  /** Staff marking a lead followed up (a call, a visit, a chat from their own phone). It is then left alone. */
  async markDone(id: string, by: string, note?: string) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Cart lead ${id} not found`);
    return this.mark(id, 'DONE', 'STAFF', (note ?? '').trim().slice(0, 300) || 'Marked as followed up by staff', by || 'staff', new Date());
  }

  /** Puts a lead back to waiting so the next run considers it again. What was already sent is remembered, so a channel that went is not repeated. */
  async reopen(id: string) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Cart lead ${id} not found`);
    if (lead.status === 'CONVERTED' || lead.status === 'EXPIRED') throw new BadRequestException('This lead is closed: an order was placed or it was dismissed.');
    return this.prisma.cartLead.update({
      where: { id },
      data: { followUpState: 'PENDING', followUpReason: null, followUpNote: 'Reopened by staff', followUpNextAt: null, followUpClaimedAt: null, followUpAttempts: 0, followUpEmailAttempts: 0, status: lead.status === 'CONTACTED' ? 'NEW' : lead.status },
    });
  }

  // --- what staff see -------------------------------------------------------------------------------------------------

  /** The state of the whole thing in one read: on or off, paused and why, what is waiting, what went today, what is marked. */
  async summary(now: Date = new Date()) {
    const cfg = followUpConfig();
    const since = new Date(now.getTime() - cfg.maxAgeMs);
    const [byState, dueNow, sentToday, emailedToday, failedRecently, byReason] = await Promise.all([
      this.prisma.cartLead.groupBy({ by: ['followUpState'], where: { createdAt: { gte: since } }, _count: true }),
      this.prisma.cartLead.count({ where: this.dueWhere(now, cfg) }),
      this.sentToday(now),
      this.prisma.emailLog.count({ where: { kind: EMAIL_KIND, status: 'SENT', sentAt: { gte: startOfNairobiDay(now) } } }),
      this.prisma.whatsappOutreach.findFirst({ where: { kind: { startsWith: 'FOLLOWUP' }, status: 'FAILED', createdAt: { gte: new Date(now.getTime() - Math.max(cfg.pauseMs, cfg.configPauseMs)) } }, orderBy: { createdAt: 'desc' }, select: { error: true, createdAt: true } }),
      this.prisma.cartLead.groupBy({ by: ['followUpReason'], where: { createdAt: { gte: since }, followUpState: { in: ['FAILED', 'SKIPPED'] } }, _count: true }),
    ]);
    const count = (state: CartLeadFollowUp) => byState.find((r) => r.followUpState === state)?._count ?? 0;
    const cap = Number(process.env.WHATSAPP_DAILY_SEND_CAP || 200) + cfg.reserve;
    const problem = failedRecently && ['ACCOUNT', 'CONFIG'].includes(classifyFailure(errorCodeOf(failedRecently.error), failedRecently.error)) ? failedRecently.error : null;
    return {
      enabled: cfg.enabled,
      window: { open: canSendNow(now), opensAt: nextWindowOpens(now).toISOString(), from: '08:00', to: '20:00', timezone: 'Africa/Nairobi' },
      delayMinutes: Math.round(cfg.delayMs / 60_000),
      backlogDays: Math.round(cfg.maxAgeMs / DAY_MS),
      // Why nothing is going out right now, when that is not just the hour.
      paused: this.pausedUntil && this.pausedUntil > now ? { until: this.pausedUntil.toISOString(), reason: this.pausedFor } : null,
      problem,
      channels: { whatsapp: this.whatsapp.isConfigured, email: this.sender.isConfigured },
      counts: { waiting: count('PENDING'), dueNow, done: count('DONE'), failed: count('FAILED'), skipped: count('SKIPPED') },
      reasons: byReason.map((r) => ({ reason: r.followUpReason, count: r._count })),
      today: { whatsapp: sentToday, emails: emailedToday, cap, remaining: Math.max(0, cap - sentToday) },
      // How long the backlog takes to clear at this pace, so the number is a plan rather than a worry.
      estimate: dueNow ? { leads: dueNow, perDay: cap, days: Math.max(1, Math.ceil(dueNow / Math.max(1, cap))) } : null,
      lastRun: this.lastTick ? { at: this.lastTick.at.toISOString(), ...this.lastTick.result } : null,
    };
  }

  /** A dry run: the next leads in line and what would be done to each, sending nothing and changing nothing. */
  async preview(limit = 25, now: Date = new Date()) {
    const cfg = followUpConfig();
    const leads = await this.prisma.cartLead.findMany({
      where: { followUpState: 'PENDING', status: { in: ['NEW', 'CONTACTED'] }, lastActivityAt: { gte: new Date(now.getTime() - cfg.maxAgeMs) } },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, limit)),
      include: leadInclude,
    });
    const rows = [];
    for (const lead of leads) {
      const contact = this.contactOf(lead);
      const facts = await this.factsFor(lead, contact.phone, contact.email, now);
      const decision = this.decisionFor(lead, contact, facts, now, cfg);
      rows.push({
        id: lead.id, name: contact.name, source: lead.source, phone: contact.phone, email: contact.email, lastActivityAt: lead.lastActivityAt,
        dueAt: dueAt(lead, cfg.delayMs),
        plan: decision.action === 'SEND'
          ? { action: 'SEND', whatsapp: decision.whatsapp, email: decision.email }
          : decision.action === 'CLOSE'
            ? { action: 'MARK', state: decision.state, reason: decision.reason, note: decision.note }
            : { action: 'WAIT', until: decision.until ?? null },
      });
    }
    return { sendingNow: canSendNow(now), opensAt: nextWindowOpens(now).toISOString(), leads: rows };
  }
}
