import { Injectable, Logger } from '@nestjs/common';

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

  /**
   * Creates or updates the contact by email (Mautic's own create-or-update
   * semantics for this endpoint), tags it, and enrolls it into the
   * e-commerce welcome campaign. One call covers all four trigger events --
   * signup, paid order, cart lead, inquiry -- since each just needs "this
   * person is a known contact, on the campaign" regardless of which path
   * got them there.
   */
  private async syncContact(params: { email: string; firstName?: string; lastName?: string; phone?: string }) {
    if (!this.configured) return;
    const email = params.email.trim().toLowerCase();
    if (!email) return;

    const response = await this.request(`/api/contacts/new`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        ...(params.firstName ? { firstname: params.firstName } : {}),
        ...(params.lastName ? { lastname: params.lastName } : {}),
        ...(params.phone ? { phone: params.phone } : {}),
        tags: [this.tag],
        overwriteWithBlank: false,
      }),
    });
    if (!response) return;
    const body = (await response.json().catch(() => null)) as { contact?: { id?: number } } | null;
    const contactId = body?.contact?.id;
    if (!contactId || !this.campaignId) return;

    await this.request(`/api/campaigns/${this.campaignId}/contact/${contactId}/add`, { method: 'POST' });
  }

  async syncSignup(params: { email: string; firstName?: string; lastName?: string; phone?: string }) {
    void this.syncContact(params);
  }

  async syncOrder(params: { email?: string | null; firstName?: string; lastName?: string; phone?: string | null }) {
    if (!params.email) return;
    void this.syncContact({ email: params.email, firstName: params.firstName, lastName: params.lastName, phone: params.phone ?? undefined });
  }

  async syncCartLead(params: { email?: string | null; name?: string | null; phone?: string | null }) {
    if (!params.email) return;
    const [firstName, ...rest] = (params.name ?? '').trim().split(/\s+/).filter(Boolean);
    void this.syncContact({ email: params.email, firstName, lastName: rest.join(' ') || undefined, phone: params.phone ?? undefined });
  }

  async syncInquiry(params: { email: string; name?: string; phone?: string | null }) {
    const [firstName, ...rest] = (params.name ?? '').trim().split(/\s+/).filter(Boolean);
    void this.syncContact({ email: params.email, firstName, lastName: rest.join(' ') || undefined, phone: params.phone ?? undefined });
  }
}
