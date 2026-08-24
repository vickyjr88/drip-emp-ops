/**
 * Terms and Privacy.
 *
 * Both are the same shape -- a hero, a last-updated line, then numbered
 * sections of prose -- so they share one component and differ only in which
 * CMS document they read. Server-rendered: the content is static text that
 * should be in the HTML for crawlers, and there is nothing interactive.
 *
 * Ships with no sections. The firm's actual terms and privacy policy are legal
 * copy that has to be written and approved, not invented here, so the page
 * says plainly that it is not published yet rather than presenting placeholder
 * text a visitor might mistake for a binding document.
 */

import { EliteLayout } from './elite-layout';
import { contentValue, fetchPageContent } from '../lib/page-content';

type LegalSection = { heading?: string; body?: string };
type LegalBlock = { kind: 'heading' | 'paragraph'; text: string };

/**
 * Turns a pasted policy into headings and paragraphs.
 *
 * Legal copy arrives as one long piece of text, so the editor pastes it whole
 * and the shape it already has is what structures it: blank lines separate
 * blocks, and a block that looks like a title becomes one.
 *
 * "Looks like a title" is deliberately narrow -- a single short line with no
 * sentence-ending punctuation. A paragraph that happens to be brief still ends
 * in a full stop, so it stays a paragraph; numbering ("1. Who we are") is
 * common in policies and is treated as a heading marker rather than as prose.
 */
export function parseLegalText(text: string): LegalBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const isSingleLine = !block.includes('\n');
      const isShort = block.length <= 80;
      // A question mark does not disqualify a heading: privacy policies are
      // full of "How do we use your data?" as a section title.
      const endsSentence = /[.!:;,]$/.test(block);
      const numbered = /^(\d+[.)]|[A-Z][.)])\s+/.test(block);
      const heading = isSingleLine && isShort && (!endsSentence || numbered);
      return { kind: heading ? ('heading' as const) : ('paragraph' as const), text: block };
    });
}

export async function LegalPage({
  slug,
  defaultHeading,
  defaultIntro,
}: {
  slug: 'terms' | 'privacy';
  defaultHeading: string;
  defaultIntro: string;
}) {
  const content = await fetchPageContent(slug);

  const kicker = contentValue(content, 'hero.kicker', 'Legal');
  const heading = contentValue(content, 'hero.heading', defaultHeading);
  const intro = contentValue(content, 'hero.intro', defaultIntro);
  const lastUpdated = contentValue(content, 'body.lastUpdated', '');
  const proseText = contentValue(content, 'body.text', '').trim();

  // Anything saved under the old section-per-field shape still renders: it is
  // flattened back into the same text the new editor would hold, so a policy
  // published before this change does not vanish, and saving once in the new
  // box makes the conversion permanent.
  const legacySections = contentValue<LegalSection[]>(content, 'body.sections', []).filter(
    (section) => section.heading?.trim() || section.body?.trim(),
  );
  const sourceText = proseText
    || legacySections
      .map((section) => [section.heading?.trim(), section.body?.trim()].filter(Boolean).join('\n\n'))
      .join('\n\n');

  const blocks = sourceText ? parseLegalText(sourceText) : [];

  return (
    <EliteLayout active="none">
      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          <div className="lp-container lp-services-hero-inner">
            <p>{kicker}</p>
            <h1>{heading}</h1>
            <span className="lp-divider" aria-hidden="true" />
            {intro ? <p className="lp-services-intro">{intro}</p> : null}
          </div>
        </section>

        <section className="lp-container lp-legal-body">
          {lastUpdated ? <p className="lp-legal-updated">Last updated {lastUpdated}</p> : null}

          {blocks.length === 0 ? (
            <div className="lp-legal-empty">
              <p>
                This policy is not published yet. For anything you need in the meantime, please
                contact us and we will answer directly.
              </p>
            </div>
          ) : (
            <article className="lp-legal-section">
              {blocks.map((block, index) =>
                block.kind === 'heading' ? (
                  <h2 key={index}>{block.text}</h2>
                ) : (
                  // A paragraph can still hold single newlines -- an address, a
                  // short list -- so those are kept rather than collapsed.
                  <p key={index} style={{ whiteSpace: 'pre-line' }}>{block.text}</p>
                ),
              )}
            </article>
          )}
        </section>
      </main>
    </EliteLayout>
  );
}
