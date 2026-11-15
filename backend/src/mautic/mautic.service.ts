import { Injectable, Logger } from '@nestjs/common';
import { realEmail } from '../common/contact-email';
import { normalizePhoneNumber } from '../common/phone.util';

/** Marks a Mautic contact known only by its phone number, until an email is found for it. */
export const PHONE_ONLY_TAG = 'phone-only';

/** What a sync did: which Mautic contact, and how it got there. */
export type MauticOutcome = { ok: true; id: number; via: 'email' | 'phone' | 'upgraded' } | { ok: false; error: string };

/**
 * Syncs storefront contacts into Mautic and enrolls them into the
 * e-commerce welcome campaign, so a signup, order, cart lead or inquiry
 * gets the same automated follow-up regardless of which of those four
 * created the contact. Mirrors x-conversion.service.ts's shape -- same
 * fire-and-forget pattern, same configured-getter gate, same
 * try/catch-into-warn error handling -- so a Mautic outage never blocks
 * the request that triggered the sync.
 */
@Injectable()
export class MauticService {
  private readonly logger = new Logger(MauticService.name);
  private readonly baseUrl = (process.env.MAUTIC_BASE_URL || '').replace(/\/+$/, '');
  private readonly clientId = process.env.MAUTIC_CLIENT_ID || '';
  private readonly clientSecret = process.env.MAUTIC_CLIENT_SECRET || '';
  private readonly campaignId = process.env.MAUTIC_CAMPAIGN_ID || '';
  /** The WhatsApp onboarding campaign. Unset means signups are not enrolled in it. */
  private readonly whatsappCampaignId = process.env.MAUTIC_WHATSAPP_CAMPAIGN_ID || '';
  private readonly tag = 'dripemporium-store';

  private token: { value: string; expiresAt: number } | null = null;

  get configured() {
    return Boolean(this.baseUrl && this.clientId && this.clientSecret);
  }

  /** Cached until shortly before expiry, so most calls skip the extra round-trip. */
  private async getAccessToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    try {
      const response = await fetch(`${this.baseUrl}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Mautic OAuth token request returned ${response.status}: ${await response.text().catch(() => '')}`);
        return null;
      }
      const body = (await response.json()) as { access_token: string; expires_in: number };
      // A minute of slack before the real expiry, so a token that is about
      // to lapse is never handed to a request that will outlive it.
      this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
      return this.token.value;
    } catch (error) {
      this.logger.warn(`Mautic OAuth token request failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        this.logger.warn(`Mautic API ${path} returned ${response.status}: ${await response.text().catch(() => '')}`);
        return null;
      }
      return response;
    } catch (error) {
      this.logger.warn(`Mautic API ${path} request failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /** Like request(), but hands back the status and the parsed body, so a caller can tell a missing contact (404) from an outage. */
  private async call(path: string, init: RequestInit): Promise<{ status: number; body: any } | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok && response.status !== 404) this.logger.warn(`Mautic API ${path} returned ${response.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
      return { status: response.status, body };
    } catch (error) {
      this.logger.warn(`Mautic API ${path} request failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Puts a person who messaged the shop on WhatsApp into Mautic, with tags that say whether they are subscribed. It does not
   * enrol them in any campaign: the app sends their onboarding messages itself, and a campaign would send them twice.
   *
   * Which Mautic contact it is: the one already known (`contactId`); else the customer's, by email (Mautic merges on email);
   * else one with the same mobile number; else a new contact with just the number and the name WhatsApp gave. A contact that
   * already has a name keeps it: a WhatsApp profile name is whatever the person typed there.
   */
  async syncWhatsappContact(params: {
    contactId?: number | null;
    email?: string | null;
    mobile: string;
    name?: string | null;
    addTags: string[];
    removeTags: string[];
  }): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
    if (!this.configured) return { ok: false, error: 'Mautic is not configured' };
    const tags = [...params.addTags, ...params.removeTags.map((t) => `-${t}`)];
    const idOf = (r: { body: any } | null) => Number(r?.body?.contact?.id) || null;
    const fail = (r: { status: number; body: any } | null) => ({ ok: false as const, error: r ? `Mautic answered ${r.status}` : 'Mautic could not be reached' });

    if (params.contactId) {
      const edited = await this.call(`/api/contacts/${params.contactId}/edit`, { method: 'PATCH', body: JSON.stringify({ tags }) });
      if (edited && edited.status < 300 && idOf(edited)) return { ok: true, id: idOf(edited)! };
      // Deleted in Mautic since: fall through and find or make it again. Any other failure is not guessed around.
      if (!edited || edited.status !== 404) return fail(edited);
    }

    if (params.email) {
      const made = await this.call(`/api/contacts/new`, { method: 'POST', body: JSON.stringify({ email: params.email.trim().toLowerCase(), tags, overwriteWithBlank: false }) });
      return made && made.status < 300 && idOf(made) ? { ok: true, id: idOf(made)! } : fail(made);
    }

    const found = await this.call(`/api/contacts?search=${encodeURIComponent(`mobile:${params.mobile}`)}&limit=1`, { method: 'GET' });
    if (!found || found.status >= 300) return fail(found);
    const existing = Object.values(found.body?.contacts ?? {})[0] as { id?: number } | undefined;
    if (existing?.id) {
      const edited = await this.call(`/api/contacts/${existing.id}/edit`, { method: 'PATCH', body: JSON.stringify({ tags }) });
      return edited && edited.status < 300 ? { ok: true, id: existing.id } : fail(edited);
    }

    const [firstName, ...rest] = (params.name ?? '').trim().split(/\s+/).filter(Boolean);
    const created = await this.call(`/api/contacts/new`, {
      method: 'POST',
      body: JSON.stringify({ mobile: params.mobile, ...(firstName ? { firstname: firstName } : {}), ...(rest.length ? { lastname: rest.join(' ') } : {}), tags: params.addTags, overwriteWithBlank: false }),
    });
    return created && created.status < 300 && idOf(created) ? { ok: true, id: idOf(created)! } : fail(created);
  }

  /** A Mautic contact found by its mobile number, with what matters for deciding what to do with it. */
  private async findByMobile(mobile: string): Promise<{ id: number; email: string | null; firstName: string; lastName: string } | { error: string } | null> {
    const found = await this.call(`/api/contacts?search=${encodeURIComponent(`mobile:${mobile}`)}&limit=1`, { method: 'GET' });
    if (!found || found.status >= 300) return { error: found ? `Mautic answered ${found.status}` : 'Mautic could not be reached' };
    const row = Object.values(found.body?.contacts ?? {})[0] as any;
    if (!row?.id) return null;
    const core = row.fields?.core ?? {};
    const value = (key: string) => String(core[key]?.value ?? '').trim();
    return { id: Number(row.id), email: value('email') || null, firstName: value('firstname'), lastName: value('lastname') };
  }

  /**
   * Puts a customer who has only a phone number into Mautic, keyed by their mobile number: the contact with that number if there is one (a
   * person who messaged the shop on WhatsApp is already there), else a new one. Tagged `phone-only` until an address turns up. Not enrolled in the
   * e-commerce campaign, whose messages are email: this keeps them in Mautic to segment and reach on WhatsApp, and ready for the day an email arrives.
   */
  private async syncPhoneOnly(params: { mobile: string; firstName?: string; lastName?: string }): Promise<MauticOutcome> {
    const found = await this.findByMobile(params.mobile);
    if (found && 'error' in found) return { ok: false, error: found.error };
    if (found) {
      const tags = found.email ? [this.tag] : [this.tag, PHONE_ONLY_TAG];
      const edited = await this.call(`/api/contacts/${found.id}/edit`, { method: 'PATCH', body: JSON.stringify({ tags }) });
      return edited && edited.status < 300 ? { ok: true, id: found.id, via: 'phone' } : { ok: false, error: edited ? `Mautic answered ${edited.status}` : 'Mautic could not be reached' };
    }
    const created = await this.call(`/api/contacts/new`, {
      method: 'POST',
      body: JSON.stringify({
        mobile: params.mobile,
        ...(params.firstName ? { firstname: params.firstName } : {}),
        ...(params.lastName ? { lastname: params.lastName } : {}),
        tags: [this.tag, PHONE_ONLY_TAG],
        overwriteWithBlank: false,
      }),
    });
    const id = Number(created?.body?.contact?.id) || null;
    return created && created.status < 300 && id ? { ok: true, id, via: 'phone' } : { ok: false, error: created ? `Mautic answered ${created.status}` : 'Mautic could not be reached' };
  }

  /**
   * Syncs a person to Mautic, whether or not they have an email. This is the one entry for storefront contacts.
   *
   * - **An email and a phone:** if Mautic already holds a contact for that number with no email (made earlier from this phone alone, or from a
   *   WhatsApp chat), that contact is given the email, so it is one person with their history, not two. If the address already belongs to another
   *   contact, Mautic's own create-or-update by email takes over. Then the contact is enrolled in the e-commerce campaign.
   * - **An email only:** created or updated by email, as before.
   * - **A phone only** (the email left blank at checkout): a contact keyed by the mobile number, tagged `phone-only`, see syncPhoneOnly.
   *
   * Never throws, and says what happened, so callers that fire it and forget it lose nothing and a test can see the outcome.
   */
  async syncContact(params: { email?: string | null; firstName?: string; lastName?: string; phone?: string | null; whatsappOnboarding?: boolean }): Promise<MauticOutcome> {
    if (!this.configured) return { ok: false, error: 'Mautic is not configured' };
    const email = realEmail(params.email);
    const mobile = params.phone ? normalizePhoneNumber(params.phone) : null;
    if (!email) {
      return mobile ? this.syncPhoneOnly({ mobile, firstName: params.firstName, lastName: params.lastName }) : { ok: false, error: 'No email and no valid phone number' };
    }

    let contactId: number | null = null;
    let via: 'email' | 'upgraded' = 'email';
    if (mobile) {
      const found = await this.findByMobile(mobile);
      if (found && 'error' in found) return { ok: false, error: found.error };
      if (found && !found.email) {
        // A contact for this number that has no address yet: it is the same person, so it gains the address (and a name only if it has none).
        const edited = await this.call(`/api/contacts/${found.id}/edit`, {
          method: 'PATCH',
          body: JSON.stringify({
            email,
            ...(params.firstName && !found.firstName ? { firstname: params.firstName } : {}),
            ...(params.lastName && !found.lastName ? { lastname: params.lastName } : {}),
            tags: [this.tag, `-${PHONE_ONLY_TAG}`],
          }),
        });
        if (edited && edited.status < 300) {
          contactId = found.id;
          via = 'upgraded';
        } else if (!edited || edited.status >= 500) {
          return { ok: false, error: edited ? `Mautic answered ${edited.status}` : 'Mautic could not be reached' };
        }
        // Anything else (the address is already on another contact, so Mautic refused): fall through to create-or-update by email, which merges
        // into that contact. The phone-only one is left as it is rather than guessed at.
      }
    }

    if (!contactId) {
      const made = await this.call(`/api/contacts/new`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          ...(params.firstName ? { firstname: params.firstName } : {}),
          ...(params.lastName ? { lastname: params.lastName } : {}),
          ...(mobile ? { mobile } : {}),
          ...(params.phone ? { phone: params.phone } : {}),
          tags: [this.tag],
          overwriteWithBlank: false,
        }),
      });
      contactId = Number(made?.body?.contact?.id) || null;
      if (!made || made.status >= 300 || !contactId) return { ok: false, error: made ? `Mautic answered ${made.status}` : 'Mautic could not be reached' };
    }

    if (this.campaignId) {
      await this.request(`/api/campaigns/${this.campaignId}/contact/${contactId}/add`, { method: 'POST' });
    }
    // Only a brand-new signup starts the WhatsApp sequence (app, group, rating). Orders, cart leads and inquiries go
    // through here too, and an existing customer must not be started on it again.
    if (params.whatsappOnboarding && this.whatsappCampaignId) {
      await this.request(`/api/campaigns/${this.whatsappCampaignId}/contact/${contactId}/add`, { method: 'POST' });
    }
    return { ok: true, id: contactId, via };
  }

  async syncSignup(params: { email: string; firstName?: string; lastName?: string; phone?: string }) {
    void this.syncContact({ ...params, whatsappOnboarding: true });
  }

  /** A paid order. The email is optional: a customer with a phone number alone is a contact too. */
  async syncOrder(params: { email?: string | null; firstName?: string; lastName?: string; phone?: string | null }) {
    void this.syncContact({ email: params.email, firstName: params.firstName, lastName: params.lastName, phone: params.phone });
  }

  /** Abandoned carts are followed up by email, so only a cart with an address is synced; a phone-only lead is left to staff (the WhatsApp link). */
  async syncCartLead(params: { email?: string | null; name?: string | null; phone?: string | null }) {
    if (!realEmail(params.email)) return;
    const [firstName, ...rest] = (params.name ?? '').trim().split(/\s+/).filter(Boolean);
    void this.syncContact({ email: params.email, firstName, lastName: rest.join(' ') || undefined, phone: params.phone ?? undefined });
  }

  async syncInquiry(params: { email: string; name?: string; phone?: string | null }) {
    const [firstName, ...rest] = (params.name ?? '').trim().split(/\s+/).filter(Boolean);
    void this.syncContact({ email: params.email, firstName, lastName: rest.join(' ') || undefined, phone: params.phone ?? undefined });
  }
}
