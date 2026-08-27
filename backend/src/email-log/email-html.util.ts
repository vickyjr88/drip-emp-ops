/** Shared escaping/formatting for the hand-rolled HTML fragments every
 *  email builder in this module sends — kept in one place so the two
 *  callers cannot drift on how untrusted text gets escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function money(amount: number) {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A brand-navy button for the one or two emails that need the reader to
 *  click through (reset a password, come back to a cart) rather than just
 *  read. Padding on the anchor itself, not a wrapping div: Outlook desktop
 *  ignores block padding on non-table elements but respects it on `<a>`. */
export function ctaButton(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#06166e;color:#f4f5fc;
      font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;
      padding:12px 28px;border-radius:6px;">${escapeHtml(label)}</a>
  </p>`;
}

/**
 * The brand ramp sampled from the storefront's own artwork
 * (web/app/globals.css), not invented for this file. Kept as a handful of
 * named constants rather than CSS custom properties -- most mail clients
 * (Outlook desktop chief among them) strip `var()`, so every value has to
 * land in the markup literally.
 */
const BRAND = {
  royal: '#06166e',
  ink: '#020721',
  muted: '#5b6480',
  line: '#dfe2f0',
  paper: '#f4f5fc',
  paperDeep: '#e8eaf8',
  white: '#ffffff',
};

/**
 * Wraps a caller's HTML fragment in the one branded shell every outgoing
 * email shares: a navy header carrying the wordmark (there is no logo image
 * in the repo to embed -- web/app/icon.svg and .lp-brand both render "Drip
 * Emporium"/"DE" as styled text, so the header does the same), the fragment
 * untouched in a white card, and a plain-text-style footer.
 *
 * Applied once, centrally, in EmailSenderService.send() -- every caller keeps
 * building the same inner fragment it always has (a <h2>, some <p> rows, a
 * <ul>) and gets the branded shell for free, including reminder-engine's
 * operator-edited ReminderRule.emailTemplate, which is just another fragment
 * as far as this function is concerned.
 *
 * Fonts match the storefront (Libre Caslon Text for the wordmark, Manrope for
 * body) via Google Fonts, with real fallback stacks: Outlook desktop and a
 * good few mobile mail clients strip the @import/<link> entirely and fall
 * back to whatever is listed after it.
 */
export function wrapEmailHtml(subject: string, bodyHtml: string): string {
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@700&family=Manrope:wght@400;600;700&display=swap');
  body { margin:0; padding:0; background:${BRAND.paper}; }
  h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; color: ${BRAND.ink}; margin: 0 0 12px; }
  p, li, td { font-family: Arial, Helvetica, sans-serif; color: ${BRAND.ink}; }
  a { color: ${BRAND.royal}; }
</style>
</head>
<body style="margin:0;padding:24px 16px;background:${BRAND.paper};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="background:${BRAND.royal};border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
        <span style="font-family:'Libre Caslon Text',Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.paper};">
          Drip Emporium
        </span>
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.white};border:1px solid ${BRAND.line};border-top:none;padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.paperDeep};border:1px solid ${BRAND.line};border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};">
        Drip Emporium &middot; Ronald Ngala Street, Nairobi<br>
        &copy; ${year} Drip Emporium. This message was sent because of activity on your account or order.
      </td>
    </tr>
  </table>
</body>
</html>`;
}
