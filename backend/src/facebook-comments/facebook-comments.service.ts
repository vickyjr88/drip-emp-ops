import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PageContentService } from '../page-content/page-content.service';
import { paginate } from '../common/pagination.util';
import { startOfNairobiDay } from '../whatsapp-outreach/whatsapp-subscription';
import {
  ALREADY_REPLIED_CODES, DEFAULT_PRIVATE_TEXT, DEFAULT_PUBLIC_TEXT, DEFAULT_SITE_URL, FeedComment, fillTemplate, isReplyToComment,
  isTransientFacebookError, looksLikeSpam,
} from './facebook-comments';

const DAY_MS = 86_400_000;
const TICK_MS = 5 * 60_000;
/** A private reply can only be sent within 7 days of the comment; a day short of that is the last time we try. */
const REPLY_WINDOW_MS = 6 * DAY_MS;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 4 * 60_000;
const STUCK_AFTER_MS = 10 * 60_000;

/** The website address in the public reply: the setting, else the storefront's own address (never a local one), else the live site. */
const siteUrl = () => {
  const own = process.env.STOREFRONT_ORIGIN || '';
  const candidate = process.env.FACEBOOK_REPLY_SITE_URL || (/localhost|127\.0\.0\.1/.test(own) ? '' : own) || DEFAULT_SITE_URL;
  return candidate.replace(/\/+$/, '');
};

export const facebookRepliesEnabled = () => (process.env.FACEBOOK_COMMENT_REPLIES || 'true') !== 'false';

type Sent<T = {}> = ({ ok: true } & T) | { ok: false; error: string; code?: number; transient: boolean };

/**
 * Opens a conversation with everyone who comments on the Page's posts and ads. Facebook lets a Page send one private message
 * to the author of a comment, within 7 days (a "private reply"); the message appears in their Messenger, where staff answer it
 * from the Page inbox. It carries a link to WhatsApp and an invitation to follow the Page, and a short public reply under the
 * comment says a message is on its way. Nothing is sent to people who only reacted: Facebook has no way to message them.
 *
 * Guards: one reply per comment (the comment id is unique, so Facebook delivering an event twice does nothing), one per person
 * per 7 days, top-level comments only, no comments with links, a daily cap, and the Page's own comments are never answered.
 */
@Injectable()
export class FacebookCommentsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FacebookCommentsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly pages: PageContentService) {}

  private get pageId() { return process.env.FACEBOOK_PAGE_ID || ''; }
  private get token() { return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || ''; }
  private get version() { return process.env.WHATSAPP_API_VERSION || 'v21.0'; }
  get configured() { return Boolean(this.pageId && this.token); }

  onApplicationBootstrap() {
    if (!facebookRepliesEnabled() || !this.configured) return;
    this.timer = setInterval(() => void this.safeRetry(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeRetry() {
    try {
      await this.retryDue();
    } catch (error) {
      this.logger.error(`Facebook comment retry failed: ${(error as Error).message}`);
    }
  }

  // --- Facebook ---------------------------------------------------------------------------------------------------------

  private async graph(path: string, body: unknown, method: 'POST' | 'GET' = 'POST'): Promise<{ status: number; data: any } | null> {
    try {
      const response = await fetch(`https://graph.facebook.com/${this.version}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    } catch (error) {
      this.logger.warn(`Facebook ${path} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private failure(r: { status: number; data: any } | null): { ok: false; error: string; code?: number; transient: boolean } {
    if (!r) return { ok: false, error: 'Facebook could not be reached', transient: true };
    const e = r.data?.error;
    const code = typeof e?.code === 'number' ? e.code : undefined;
    return { ok: false, error: [code, e?.error_user_msg || e?.message || `HTTP ${r.status}`].filter((x) => x !== undefined).join(': ').slice(0, 400), code, transient: isTransientFacebookError(code, r.status) };
  }

  /** The one private message to the author of a comment. */
  private async privateReply(commentId: string, text: string): Promise<Sent<{ recipientId?: string; messageId?: string }>> {
    const r = await this.graph(`${this.pageId}/messages`, { recipient: { comment_id: commentId }, message: { text }, messaging_type: 'RESPONSE' });
    if (r && r.status < 300 && r.data?.message_id) return { ok: true, recipientId: r.data.recipient_id, messageId: r.data.message_id };
    return this.failure(r);
  }

  private async publicReply(commentId: string, text: string): Promise<Sent<{ id?: string }>> {
    const r = await this.graph(`${commentId}/comments`, { message: text });
    if (r && r.status < 300 && r.data?.id) return { ok: true, id: r.data.id };
    return this.failure(r);
  }

  /** What Facebook says about the app's subscription to the Page: whether comments will be sent to us at all. */
  async subscription(): Promise<{ subscribed: boolean; fields: string[]; error?: string }> {
    if (!this.configured) return { subscribed: false, fields: [], error: 'FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN are not set' };
    const r = await this.graph(`${this.pageId}/subscribed_apps`, null, 'GET');
    if (!r || r.status >= 300) return { subscribed: false, fields: [], error: this.failure(r).error };
    const fields: string[] = (r.data?.data ?? []).flatMap((a: any) => a?.subscribed_fields ?? []);
    return { subscribed: fields.includes('feed'), fields };
  }

  // --- the rules --------------------------------------------------------------------------------------------------------

  private async texts() {
    let whatsapp = (process.env.FACEBOOK_REPLY_WHATSAPP || '').replace(/\D/g, '');
    let page = process.env.FACEBOOK_PAGE_URL || '';
    if (!whatsapp || !page) {
      try {
        const [header, footer] = await Promise.all([this.pages.findOne('header'), this.pages.findOne('footer')]);
        if (!whatsapp) whatsapp = String((header.content as any)?.enquiries?.whatsapp ?? '').replace(/\D/g, '');
        if (!page) page = String((footer.content as any)?.social?.facebook ?? '');
      } catch (error) {
        this.logger.warn(`Could not read the site content for the reply text: ${(error as Error).message}`);
      }
    }
    return {
      whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : '',
      page: page || `https://www.facebook.com/${this.pageId}`,
      site: siteUrl(),
      privateText: process.env.FACEBOOK_PRIVATE_REPLY_TEXT || DEFAULT_PRIVATE_TEXT,
      publicText: process.env.FACEBOOK_PUBLIC_REPLY_TEXT || DEFAULT_PUBLIC_TEXT,
      publicOn: (process.env.FACEBOOK_PUBLIC_REPLY || 'true') !== 'false',
    };
  }

  private async skip(id: string, detail: string) {
    await this.prisma.facebookCommentReply.update({ where: { id }, data: { status: 'SKIPPED', detail } });
    return 'SKIPPED' as const;
  }

  /** What to do with one new comment. Safe to call twice for the same comment: the second time does nothing. */
  async handleComment(comment: FeedComment): Promise<'IGNORED' | 'DUPLICATE' | 'SKIPPED' | 'SENT' | 'RETRY' | 'FAILED'> {
    if (!facebookRepliesEnabled() || !this.configured) return 'IGNORED';
    // The Page's own comments (including our public reply) are not answered.
    if (comment.fromId && comment.fromId === this.pageId) return 'IGNORED';
    if (comment.pageId && comment.pageId !== this.pageId) return 'IGNORED';

    let row;
    try {
      row = await this.prisma.facebookCommentReply.create({
        data: {
          commentId: comment.commentId, postId: comment.postId, pageId: comment.pageId ?? this.pageId, fromId: comment.fromId,
          fromName: comment.fromName, message: comment.message?.slice(0, 500) ?? null, commentedAt: comment.createdAt,
        },
      });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return 'DUPLICATE';
      throw error;
    }

    if (isReplyToComment(comment)) return this.skip(row.id, 'A reply to another comment');
    if (!comment.fromId) return this.skip(row.id, 'No commenter id from Facebook');
    if (looksLikeSpam(comment.message)) return this.skip(row.id, 'The comment has a link');

    const since = new Date(Date.now() - 7 * DAY_MS);
    const already = await this.prisma.facebookCommentReply.count({ where: { fromId: comment.fromId, status: 'SENT', repliedAt: { gte: since }, id: { not: row.id } } });
    if (already) return this.skip(row.id, 'Already messaged this person this week');

    const cap = Number(process.env.FACEBOOK_REPLY_DAILY_CAP || 200);
    const today = await this.prisma.facebookCommentReply.count({ where: { status: 'SENT', repliedAt: { gte: startOfNairobiDay(new Date()) } } });
    if (today >= cap) return this.skip(row.id, `Daily limit of ${cap} reached`);

    return this.reply(row.id);
  }

  /** Sends the private reply (then the public one) for a row, and records what happened. */
  private async reply(id: string): Promise<'SENT' | 'RETRY' | 'FAILED' | 'SKIPPED'> {
    const row = await this.prisma.facebookCommentReply.findUniqueOrThrow({ where: { id } });
    const t = await this.texts();
    const vars = { name: row.fromName, whatsapp: t.whatsapp, page: t.page, site: t.site };
    const attempts = row.attempts + 1;

    const sent = await this.privateReply(row.commentId, fillTemplate(t.privateText, vars));
    if (!sent.ok) {
      if (sent.code !== undefined && ALREADY_REPLIED_CODES.has(sent.code)) {
        await this.prisma.facebookCommentReply.update({ where: { id }, data: { status: 'SKIPPED', detail: 'Already answered privately', attempts } });
        return 'SKIPPED';
      }
      const retry = sent.transient && attempts < MAX_ATTEMPTS;
      await this.prisma.facebookCommentReply.update({ where: { id }, data: { status: retry ? 'RETRY' : 'FAILED', detail: sent.error, attempts } });
      if (!retry) this.logger.warn(`Private reply to comment ${row.commentId} failed: ${sent.error}`);
      return retry ? 'RETRY' : 'FAILED';
    }

    // Said only after the private message went, so the public line is never a promise that was not kept.
    let detail: string | null = null;
    let publicId: string | undefined;
    if (t.publicOn) {
      const pub = await this.publicReply(row.commentId, fillTemplate(t.publicText, vars));
      if (pub.ok) publicId = pub.id;
      else detail = `Private reply sent; the public reply failed: ${pub.error}`;
    }
    await this.prisma.facebookCommentReply.update({
      where: { id },
      data: { status: 'SENT', detail, attempts, recipientId: sent.recipientId, privateMessageId: sent.messageId, publicReplyId: publicId, repliedAt: new Date() },
    });
    return 'SENT';
  }

  /** Replies that failed for a reason that may pass (Facebook down, rate limited), tried again while the 7 days last. */
  async retryDue(now: Date = new Date()): Promise<number> {
    if (!facebookRepliesEnabled() || !this.configured) return 0;
    const due = await this.prisma.facebookCommentReply.findMany({
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        createdAt: { gte: new Date(now.getTime() - REPLY_WINDOW_MS) },
        // A reply left PENDING is one whose backend stopped mid-send. If its message did go, Facebook says so and it is skipped.
        OR: [
          { status: 'RETRY', updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
          { status: 'PENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    let done = 0;
    for (const row of due) {
      // Take it before sending, so the other backend slot does not send it too.
      const claimed = await this.prisma.facebookCommentReply.updateMany({ where: { id: row.id, status: row.status, updatedAt: row.updatedAt }, data: { status: 'PENDING' } });
      if (claimed.count !== 1) continue;
      await this.reply(row.id);
      done += 1;
    }
    return done;
  }

  // --- for the portal ---------------------------------------------------------------------------------------------------

  async status() {
    const [subscription, counts, today] = await Promise.all([
      this.subscription(),
      this.prisma.facebookCommentReply.groupBy({ by: ['status'], _count: true }),
      this.prisma.facebookCommentReply.count({ where: { status: 'SENT', repliedAt: { gte: startOfNairobiDay(new Date()) } } }),
    ]);
    const by = Object.fromEntries(counts.map((c) => [c.status, c._count]));
    return {
      enabled: facebookRepliesEnabled(),
      configured: this.configured,
      webhookSecretSet: Boolean(process.env.FACEBOOK_WEBHOOK_SECRET),
      pageId: this.pageId || null,
      subscribed: subscription.subscribed,
      subscriptionError: subscription.error ?? null,
      sent: by.SENT ?? 0, skipped: by.SKIPPED ?? 0, failed: by.FAILED ?? 0, waiting: (by.RETRY ?? 0) + (by.PENDING ?? 0),
      sentToday: today,
      dailyCap: Number(process.env.FACEBOOK_REPLY_DAILY_CAP || 200),
    };
  }

  list(query: { skip?: number; take?: number; status?: string }) {
    const where: Prisma.FacebookCommentReplyWhereInput = query.status ? { status: query.status } : {};
    return paginate(
      (args) => this.prisma.facebookCommentReply.findMany({ where, orderBy: { createdAt: 'desc' }, ...args }),
      () => this.prisma.facebookCommentReply.count({ where }),
      query.skip,
      query.take,
    );
  }
}
