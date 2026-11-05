import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../lib/site';
import { EliteLayout } from '../../components/elite-layout';
import { fetchBlogPost, formatBlogDate, readingTime } from '../../lib/blog';
import { blogCover } from '../../lib/blog-cover';
import { brandPreviewImage, sharePreviewUrl } from '../../lib/preview-image';

function shareSource(src: string) {
  return /^https?:\/\//i.test(src) ? src : absoluteUrl(src);
}

// Rendered per request, matching /blog and /shop/[slug]: content should
// appear without a rebuild, and this is the page a crawler most needs to
// see fully server-rendered.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await fetchBlogPost(params.slug);
  if (!post) return { title: 'Post not found', robots: { index: false, follow: true } };

  // A portal upload wins. A picture shipped with the site is next. The brand banner is the last resort.
  const cover = blogCover(post.slug, post.coverImageUrl);
  const shareImage = cover ? shareSource(cover.src) : await brandPreviewImage();

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      type: 'article',
      ...(shareImage ? { images: [{ url: sharePreviewUrl(shareImage), width: 1200, height: 630, type: 'image/jpeg' }] } : {}),
    },
    twitter: {
      card: shareImage ? 'summary_large_image' : 'summary',
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      ...(shareImage ? { images: [sharePreviewUrl(shareImage)] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await fetchBlogPost(params.slug);
  if (!post) notFound();
  const cover = blogCover(post.slug, post.coverImageUrl);

  return (
    <>
      <JsonLd
        data={{
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: absoluteUrl('/blog') },
            { '@type': 'ListItem', position: 3, name: post.title, item: absoluteUrl(`/blog/${post.slug}`) },
          ],
        }}
      />
      {/* BlogPosting, the schema.org type answer engines look for when
          attributing an article's author, date and publisher. */}
      <JsonLd
        data={{
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          author: { '@type': 'Organization', name: post.author },
          publisher: { '@type': 'Organization', name: SITE_NAME, '@id': `${absoluteUrl('/')}#organization` },
          mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
          ...(cover ? { image: shareSource(cover.src) } : {}),
        }}
      />
      <EliteLayout active="none">
        <main className="lp-main-content lp-services-page">
          <section className="lp-services-hero">
            <div className="lp-container lp-services-hero-inner">
              <p><Link href="/blog">Blog</Link></p>
              <h1>{post.title}</h1>
              <span className="lp-divider" aria-hidden="true" />
              <p className="lp-services-intro">
                {post.author} · {formatBlogDate(post.publishedAt)} · {readingTime(post.body)} min read
              </p>
            </div>
          </section>

          {cover ? (
            <figure className="lp-container de-blog-cover">
              <Image
                src={cover.src}
                alt={post.title}
                fill
                sizes="(max-width: 860px) 100vw, 820px"
                style={{ objectFit: 'cover' }}
                priority
              />
              {cover.credit ? (
                <figcaption className="de-blog-cover-credit">
                  Photo by <a href={cover.credit.authorUrl}>{cover.credit.author}</a>
                  {' · '}
                  <a href={cover.credit.fileUrl}>Wikimedia Commons</a>
                  {' · '}
                  <a href={cover.credit.licenseUrl} rel="license">{cover.credit.license}</a>
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <section className="lp-container lp-legal-body">
            <article
              className="lp-legal-section de-blog-body"
              // Authored only by staff through the blog editor, the same trust
              // boundary as every other CMS-driven rich-text field in this app
              // (LegalPage's body.text, FaqPage's answers).
              dangerouslySetInnerHTML={{ __html: post.body }}
            />
          </section>

          <section className="lp-area-cta">
            <div className="lp-container">
              <h2>Ready to shop?</h2>
              <p>Browse the full catalogue -- Nike, Adidas, Jordan and Puma, EUR 36-46.</p>
              <div className="lp-area-cta-actions">
                <Link className="lp-button lp-button-primary" href="/shop">Shop Now</Link>
                <Link className="lp-button lp-button-ghost" href="/blog">More Articles</Link>
              </div>
            </div>
          </section>
        </main>
      </EliteLayout>
    </>
  );
}
