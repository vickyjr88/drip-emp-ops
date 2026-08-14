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
  const sections = contentValue<LegalSection[]>(content, 'body.sections', []).filter(
    (section) => section.heading?.trim() || section.body?.trim(),
  );

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

          {sections.length === 0 ? (
            <div className="lp-legal-empty">
              <p>
                This policy is not published yet. For anything you need in the meantime, please
                contact us and we will answer directly.
              </p>
            </div>
          ) : (
            sections.map((section, index) => (
              <article key={`${section.heading}-${index}`} className="lp-legal-section">
                {section.heading ? <h2>{section.heading}</h2> : null}
                {/* Blank lines separate paragraphs, so an editor writes prose
                    rather than markup. */}
                {(section.body || '')
                  .split(/\n\s*\n/)
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                  .map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
              </article>
            ))
          )}
        </section>
      </main>
    </EliteLayout>
  );
}
