import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSenderService } from '../email-log/email-sender.service';
import { WhatsAppService } from '../daily-report/whatsapp.service';
import { localDateKey, windowForDate } from '../daily-report/daily-report.window';
import { ALERT_KINDS, AlertKind, AlertKindInfo } from './alert-kinds';
import { AlertEvent, followUpUrl, renderEmail, renderWhatsAppText, summaryLine, templateParams } from './alert-render';

/** Where an alert goes until recipients are saved on the Notifications page (as the daily report does). */
const DEFAULT_EMAIL = process.env.OWNER_EMAIL || 'emporiumdrip@gmail.com';
const DEFAULT_WHATSAPP = process.env.OWNER_WHATSAPP || '254771114712';
const DEFAULT_TEMPLATE = process.env.WHATSAPP_ALERT_TEMPLATE || 'admin_alert';
const DEFAULT_CAP = 80;
/** A little inside WhatsApp's 24 hours, so a message sent at the edge is not refused. */
const WINDOW_MS = 23 * 3_600_000;

export type KindFlags = { email: boolean; whatsapp: boolean };
export type AlertSettings = {
  enabled: boolean;
  emailRecipients: string[];
  whatsappRecipients: string[];
  whatsappTemplate: string;
  dailyWhatsAppCap: number;
  kinds: Record<AlertKind, KindFlags>;
};
export type DeliveryEntry = { to: string; status: 'SENT' | 'FAILED' | 'SKIPPED'; how?: 'TEXT' | 'TEMPLATE'; error?: string };
export type Delivery = { email: DeliveryEntry[]; whatsapp: DeliveryEntry[]; skipped?: string };

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly origin = (process.env.PORTAL_ORIGIN || 'https://dripemporium.store').replace(/\/$/, '');

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailSenderService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // --- settings ---------------------------------------------------------------

  private resolve(row: { enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[]; whatsappTemplate: string | null; dailyWhatsAppCap: number; kinds: Prisma.JsonValue } | null): AlertSettings {
    const stored = (row?.kinds ?? {}) as Record<string, Partial<KindFlags>>;
    const kinds = {} as Record<AlertKind, KindFlags>;
    for (const k of ALERT_KINDS) {
      kinds[k.kind] = { email: stored[k.kind]?.email ?? true, whatsapp: stored[k.kind]?.whatsapp ?? true };
    }
    return {
      enabled: row?.enabled ?? true,
      emailRecipients: row ? row.emailRecipients : [DEFAULT_EMAIL],
      whatsappRecipients: row ? row.whatsappRecipients : [DEFAULT_WHATSAPP],
      whatsappTemplate: row?.whatsappTemplate || DEFAULT_TEMPLATE,
      dailyWhatsAppCap: row?.dailyWhatsAppCap ?? DEFAULT_CAP,
      kinds,
    };
  }

  async getSettings() {
    const row = await this.prisma.alertSetting.findUnique({ where: { id: 'singleton' } });
    const settings = this.resolve(row);
    return {
      ...settings,
      isCustomised: Boolean(row),
      whatsappConfigured: this.whatsapp.isConfigured,
      kindList: ALERT_KINDS.map((k: AlertKindInfo) => ({ ...k, ...settings.kinds[k.kind] })),
      sentToday: await this.whatsappSentToday(),
    };
  }

  async updateSettings(
    patch: { enabled?: boolean; emailRecipients?: string[]; whatsappRecipients?: string[]; whatsappTemplate?: string; dailyWhatsAppCap?: number; kinds?: Partial<Record<AlertKind, Partial<KindFlags>>> },
    updatedBy: string,
  ) {
    const current = this.resolve(await this.prisma.alertSetting.findUnique({ where: { id: 'singleton' } }));
    const kinds: Record<string, KindFlags> = { ...current.kinds };
    for (const [kind, flags] of Object.entries(patch.kinds ?? {})) {
      if (!kinds[kind]) continue;
      kinds[kind] = { email: flags?.email ?? kinds[kind].email, whatsapp: flags?.whatsapp ?? kinds[kind].whatsapp };
    }
    const data = {
      enabled: patch.enabled ?? current.enabled,
      emailRecipients: patch.emailRecipients ?? current.emailRecipients,
      whatsappRecipients: patch.whatsappRecipients ?? current.whatsappRecipients,
      whatsappTemplate: patch.whatsappTemplate?.trim() || current.whatsappTemplate,
      dailyWhatsAppCap: patch.dailyWhatsAppCap ?? current.dailyWhatsAppCap,
      kinds: kinds as unknown as Prisma.InputJsonValue,
      updatedBy,
    };
    await this.prisma.alertSetting.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    return this.getSettings();
  }

  // --- raising an alert ---------------------------------------------------------

  /**
   * Tells the shop's people. Never throws and never waits on the caller: an alert is a courtesy, not part of the sale, signup or message
   * it reports, so a failure here must not fail that. Every alert is logged, with what happened to it.
   */
  async notify(event: AlertEvent): Promise<void> {
    try {
      const settings = this.resolve(await this.prisma.alertSetting.findUnique({ where: { id: 'singleton' } }));
      const row = await this.record(event);
      if (!row) return; // the same event already raised
      const flags = settings.kinds[event.kind] ?? { email: true, whatsapp: true };
      if (!settings.enabled || (!flags.email && !flags.whatsapp)) {
        await this.finish(row.id, { email: [], whatsapp: [], skipped: settings.enabled ? 'This kind of alert is switched off.' : 'Alerts are switched off.' });
        return;
      }
      await this.finish(row.id, await this.deliver(event, settings, flags));
    } catch (error) {
      this.logger.error(`Alert "${event.subject}" failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** A test message, to every recipient, whatever the switches say. Answers with what happened to each. */
  async sendTest(by: string): Promise<Delivery> {
    const settings = this.resolve(await this.prisma.alertSetting.findUnique({ where: { id: 'singleton' } }));
    const event: AlertEvent = {
      kind: 'inquiry.contact',
      subject: 'Test alert',
      heading: 'This is a test alert',
      rows: [['Sent by', by], ['At', new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })]],
      text: { label: 'Message', value: 'If you can read this, alerts reach you here.' },
      portalPath: '/portal/notifications',
    };
    const row = await this.prisma.adminAlert.create({
      data: { kind: 'test', subject: event.subject, summary: summaryLine(event), link: event.portalPath, results: {} },
    });
    const result = await this.deliver(event, settings, { email: true, whatsapp: true }, { ignoreCap: true });
    await this.finish(row.id, result);
    return result;
  }

  async recent(limit = 50) {
    return this.prisma.adminAlert.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(200, Math.max(1, limit)) });
  }

  /** Whether a number is one of the people who receive alerts: their own messages to the shop are not worth an alert to themselves. */
  async isOwnNumber(raw: string): Promise<boolean> {
    const settings = this.resolve(await this.prisma.alertSetting.findUnique({ where: { id: 'singleton' } }));
    const theirs = this.whatsapp.normalisePhone(raw);
    return Boolean(theirs) && settings.whatsappRecipients.some((r) => this.whatsapp.normalisePhone(r) === theirs);
  }

  /** A size that a sale has taken to or below its reorder level. Once a day per size. */
  async checkLowStock(variantId: string, storeId: string) {
    try {
      const level = await this.prisma.stockLevel.findUnique({
        where: { variantId_storeId: { variantId, storeId } },
        include: { variant: { include: { product: { select: { name: true } } } }, store: { select: { name: true } } },
      });
      if (!level || level.quantity > level.reorderAt) return;
      await this.notify({
        kind: 'stock.low',
        subject: level.quantity <= 0 ? `Sold out: ${level.variant.product.name} ${level.variant.name}` : `Running low: ${level.variant.product.name} ${level.variant.name}`,
        heading: level.quantity <= 0 ? 'A size has sold out' : 'A size is running low',
        rows: [['Item', `${level.variant.product.name} (${level.variant.name})`], ['Store', level.store.name], ['On the shelf', String(level.quantity)], ['Reorder at', String(level.reorderAt)]],
        portalPath: '/portal/inventory',
        dedupeKey: `${variantId}:${storeId}:${localDateKey(new Date())}`,
      });
    } catch (error) {
      this.logger.warn(`Low-stock check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // --- internals -----------------------------------------------------------------

  private async record(event: AlertEvent) {
    try {
      return await this.prisma.adminAlert.create({
        data: {
          kind: event.kind,
          dedupeKey: event.dedupeKey ?? null,
          subject: event.subject,
          summary: summaryLine(event),
          link: event.portalPath ?? null,
          followUpUrl: followUpUrl(event),
        },
      });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return null;
      throw error;
    }
  }

  private async finish(id: string, results: Delivery) {
    await this.prisma.adminAlert.update({ where: { id }, data: { results: results as unknown as Prisma.InputJsonValue } });
  }

  private async whatsappSentToday(): Promise<number> {
    const since = windowForDate(localDateKey(new Date())).start;
    const rows = await this.prisma.adminAlert.findMany({ where: { createdAt: { gte: since } }, select: { results: true } });
    return rows.reduce((n, r) => n + ((r.results as unknown as Delivery)?.whatsapp ?? []).filter((w) => w.status === 'SENT').length, 0);
  }

  private async windowOpen(phone: string): Promise<boolean> {
    const contact = await this.prisma.whatsappContact.findUnique({ where: { phone }, select: { lastMessageAt: true } });
    return Boolean(contact && Date.now() - contact.lastMessageAt.getTime() < WINDOW_MS);
  }

  private async deliver(event: AlertEvent, settings: AlertSettings, flags: KindFlags, opts: { ignoreCap?: boolean } = {}): Promise<Delivery> {
    const result: Delivery = { email: [], whatsapp: [] };

    const sendEmails = async () => {
      if (!flags.email) return;
      const mail = renderEmail(event, this.origin);
      for (const to of settings.emailRecipients) {
        try {
          const sent = await this.email.send({ to, subject: mail.subject, html: mail.html });
          result.email.push({ to, status: sent.delivered ? 'SENT' : 'FAILED', error: sent.delivered ? undefined : sent.error });
        } catch (error) {
          result.email.push({ to, status: 'FAILED', error: error instanceof Error ? error.message : String(error) });
        }
      }
    };

    const sendWhatsApps = async () => {
      if (!flags.whatsapp) return;
      let remaining = Infinity;
      if (!opts.ignoreCap) remaining = Math.max(0, settings.dailyWhatsAppCap - (await this.whatsappSentToday()));
      for (const raw of settings.whatsappRecipients) {
        if (remaining <= 0) {
          result.whatsapp.push({ to: raw, status: 'SKIPPED', error: `Today's limit of ${settings.dailyWhatsAppCap} WhatsApp alerts has been reached.` });
          continue;
        }
        const entry = await this.sendWhatsApp(raw, event, settings.whatsappTemplate);
        if (entry.status === 'SENT') remaining -= 1;
        result.whatsapp.push(entry);
      }
    };

    await Promise.all([sendEmails(), sendWhatsApps()]);
    return result;
  }

  private async sendWhatsApp(raw: string, event: AlertEvent, template: string): Promise<DeliveryEntry> {
    const phone = this.whatsapp.normalisePhone(raw);
    if (!phone) return { to: raw, status: 'FAILED', error: 'That is not a usable WhatsApp number.' };
    if (!this.whatsapp.isConfigured) return { to: phone, status: 'SKIPPED', error: 'WhatsApp is not set up on the server.' };

    // Inside the 24 hours after this person last wrote to the business, the whole message can go as plain text.
    if (await this.windowOpen(phone)) {
      const text = await this.whatsapp.sendText(phone, renderWhatsAppText(event, this.origin));
      if (text.delivered) return { to: phone, status: 'SENT', how: 'TEXT' };
    }
    const sent = await this.whatsapp.sendTemplate(phone, templateParams(event, this.origin), template);
    if (sent.delivered) return { to: phone, status: 'SENT', how: 'TEMPLATE' };
    const hint = sent.errorCode === '132001' ? ` The template "${template}" is not approved in WhatsApp Manager yet.` : '';
    return { to: phone, status: 'FAILED', how: 'TEMPLATE', error: `${sent.error ?? 'Not delivered'}${hint}` };
  }
}
