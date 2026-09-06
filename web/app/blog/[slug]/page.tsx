import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd, SITE_NAME, absoluteUrl } from '../../lib/site';
import { EliteLayout } from '../../components/elite-layout';
import { fetchBlogPost, formatBlogDate, readingTime } from '../../lib/blog';

// Rendered per request, matching /blog and /shop/[slug]: content should
// appear without a rebuild, and this is the page a crawler most needs to
// see fully server-rendered.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await fetchBlogPost(params.slug);
  if (!post) return { title: 'Post not found', robots: { index: false, follow: true } };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      type: 'article',
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
    twitter: {
      card: post.coverImageUrl ? 'summary_large_image' : 'summary',
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      ...(post.coverImageUrl ? { images: [post.coverImageUrl] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await fetchBlogPost(params.slug);
  if (!post) notFound();

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
          ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
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

          {post.coverImageUrl ? (
            <section className="lp-container de-blog-cover">
              <Image
                src={post.coverImageUrl}
                alt=""
                fill
                sizes="(max-width: 860px) 100vw, 820px"
                style={{ objectFit: 'cover' }}
                priority
              />
            </section>
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
