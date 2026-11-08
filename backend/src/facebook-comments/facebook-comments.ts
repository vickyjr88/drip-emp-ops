/** One new comment on the Page, from Facebook's `feed` webhook. */
export type FeedComment = {
  commentId: string;
  postId: string | null;
  parentId: string | null;
  pageId: string | null;
  fromId: string | null;
  fromName: string | null;
  message: string | null;
  createdAt: Date | null;
};

/** The new comments in a Page webhook body. Edits, deletions, reactions, posts and everything else are ignored. */
export function parseFeedWebhook(body: any): FeedComment[] {
  const out: FeedComment[] = [];
  if (!body || body.object !== 'page' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value;
      if (change?.field !== 'feed' || !v || v.item !== 'comment' || v.verb !== 'add' || !v.comment_id) continue;
      const created = Number(v.created_time);
      out.push({
        commentId: String(v.comment_id),
        postId: v.post_id ? String(v.post_id) : null,
        parentId: v.parent_id ? String(v.parent_id) : null,
        pageId: entry?.id ? String(entry.id) : null,
        fromId: v.from?.id ? String(v.from.id) : null,
        fromName: v.from?.name ? String(v.from.name) : null,
        message: typeof v.message === 'string' ? v.message : null,
        createdAt: Number.isFinite(created) && created > 0 ? new Date(created * 1000) : null,
      });
    }
  }
  return out;
}

/** A comment that is a reply to another comment, not to the post. Only the top-level ones are answered. */
export const isReplyToComment = (c: Pick<FeedComment, 'postId' | 'parentId'>) => Boolean(c.parentId && c.postId && c.parentId !== c.postId);

/** Links in a comment are nearly always spam or someone else's advert; those are not answered. */
export const looksLikeSpam = (message: string | null) => Boolean(message && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co|ke|net|org|io|me|ly)\b\/)/i.test(message));

export const firstName = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || '';

/** Fills {name}, {whatsapp} and {page} in a reply text. A missing name reads "there", and a missing link drops its sentence's link. */
export function fillTemplate(template: string, vars: { name?: string | null; whatsapp?: string | null; page?: string | null }): string {
  return template
    .replace(/\{name\}/g, firstName(vars.name) || 'there')
    .replace(/\{whatsapp\}/g, vars.whatsapp || '')
    .replace(/\{page\}/g, vars.page || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const DEFAULT_PRIVATE_TEXT =
  "Hi {name}! 👋 Thanks for your interest in Drip Emporium. Reply here with the pair and your size and we'll confirm the price and delivery, or chat to us on WhatsApp: {whatsapp}\n\nFollow our page for new arrivals and offers: {page}";
export const DEFAULT_PUBLIC_TEXT = "Thanks {name}! 📩 We've sent you a message with the details. Check your Messenger inbox (or Message requests).";

/** Facebook errors that mean "try again later" rather than "this will never work": the service is down, rate limited, or the call timed out. */
export function isTransientFacebookError(code: number | null | undefined, status: number | null | undefined): boolean {
  if (status && status >= 500) return true;
  return code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 341 || code === 613;
}

/** Facebook's one-per-comment rule, as it reports it: this comment was already answered privately. */
export const ALREADY_REPLIED_CODES = new Set([10900, 10901, 10903]);
