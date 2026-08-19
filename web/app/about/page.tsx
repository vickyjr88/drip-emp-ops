import type { Metadata } from 'next';
import Link from 'next/link';
import { seoMetadata } from '../lib/page-metadata';
import { EliteLayout } from '../components/elite-layout';
import { contentValue, fetchPageContent } from '../lib/page-content';

/**
 * About.
 *
 * Rewritten for the shop. The previous page carried leadership profiles,
 * client testimonials, awards and a heritage timeline — the shape a property
 * firm needs to establish standing before a large transaction. A shoe shop
 * earns trust differently: say what is stocked, how it is priced, and where to
 * find it. Sections that would have to be invented are gone rather than filled
 * with plausible copy.
 */

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'about',
    path: '/about',
    title: 'About Us',
    description:
      'Drip Emporium stocks genuine sneakers and streetwear from Nike, Adidas, Jordan and Puma at two shops on Ronald Ngala Street, Nairobi.',
    shareTitle: 'About Drip Emporium',
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

type ValueItem = { title: string; description: string };
type GalleryPhoto = { image: string; caption?: string };

export default async function AboutPage() {
  const content = await fetchPageContent('about');

  const heroKicker = contentValue(content, 'hero.kicker', 'Drip Emporium');
  const heroHeading = contentValue(content, 'hero.heading', 'Who We Are');
  const heroIntro = contentValue(content, 'hero.intro', '');
  const heroImage = contentValue(content, 'hero.image', '');

  const storyKicker = contentValue(content, 'story.kicker', 'Our Story');
  const storyHeading = contentValue(content, 'story.heading', 'Built on the Right Pair');
  const storyParagraphs = contentValue<string[]>(content, 'story.paragraphs', []);
  const storyImage = contentValue(content, 'story.image', '');

  const galleryHeading = contentValue(content, 'gallery.heading', 'Inside the Shop');
  const galleryItems = contentValue<GalleryPhoto[]>(content, 'gallery.items', []).filter((item) => item.image);

  const valuesKicker = contentValue(content, 'values.kicker', 'What We Stand For');
  const valuesHeading = contentValue(content, 'values.heading', 'How We Trade');
  const values = contentValue<ValueItem[]>(content, 'values.items', []);

  const ctaHeading = contentValue(content, 'cta.heading', 'Come and try a pair on');
  const ctaBody = contentValue(content, 'cta.body', '');
  const ctaPrimary = contentValue(content, 'cta.primaryLabel', 'Get Directions');
  const ctaSecondary = contentValue(content, 'cta.secondaryLabel', 'Shop Online');

  return (
    <EliteLayout active="profile">
      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          {heroImage ? (
            <div
              className="lp-hero-image"
              aria-hidden="true"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
          ) : null}
          <div className="lp-container lp-services-hero-inner">
            <p>{heroKicker}</p>
            <h1>{heroHeading}</h1>
            <span className="lp-divider" aria-hidden="true" />
            {heroIntro ? <p className="lp-services-intro">{heroIntro}</p> : null}
          </div>
        </section>

        {storyParagraphs.length ? (
          <section className={`lp-container de-about-story${storyImage ? ' has-image' : ''}`}>
            <div className="de-about-story-copy">
              <p className="lp-about-eyebrow">{storyKicker}</p>
              <h2>{storyHeading}</h2>
              <span className="lp-divider" aria-hidden="true" />
              {storyParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            {storyImage ? (
              <div className="de-about-story-media">
                <img src={storyImage} alt="" />
              </div>
            ) : null}
          </section>
        ) : null}

        {galleryItems.length ? (
          <section className="lp-container de-about-gallery">
            {galleryHeading ? <h2>{galleryHeading}</h2> : null}
            <div className="de-gallery-strip">
              {galleryItems.map((photo, index) => (
                <figure key={`${photo.image}-${index}`}>
                  <img src={photo.image} alt={photo.caption || ''} loading="lazy" />
                  {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {values.length ? (
          <section className="lp-container de-about-values">
            <div className="lp-heading-center">
              <p className="lp-about-eyebrow">{valuesKicker}</p>
              <h2>{valuesHeading}</h2>
              <span className="lp-divider" aria-hidden="true" />
            </div>
            <div className="de-value-grid">
              {values.map((item, index) => (
                <article key={`${item.title}-${index}`} className="de-value">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="lp-area-cta">
          <div className="lp-container">
            <h2>{ctaHeading}</h2>
            {ctaBody ? <p>{ctaBody}</p> : null}
            <div className="lp-area-cta-actions">
              <Link className="lp-button lp-button-primary" href="/contact">{ctaPrimary}</Link>
              <Link className="lp-button lp-button-ghost" href="/shop">{ctaSecondary}</Link>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
