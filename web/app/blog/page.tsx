import type { Metadata } from 'next';
import Link from 'next/link';
import { seoMetadata } from '../lib/page-metadata';
import { EliteLayout } from '../components/elite-layout';
import { fetchBlogPosts, formatBlogDate, readingTime } from '../lib/blog';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'blog',
    path: '/blog',
    title: 'Blog',
    description:
      'Sneaker guides, styling tips and streetwear trends from Drip Emporium -- sizing, care, spotting fakes, and what to buy in Kenya right now.',
  });
}

// Rendered per request so a new post appears without a rebuild, matching
// every other content-driven page in this app.
export const dynamic = 'force-dynamic';

export default async function BlogIndexPage() {
  const { items: posts } = await fetchBlogPosts({ take: 50 });

  return (
    <EliteLayout active="none">
      <main className="lp-main-content lp-services-page">
        <section className="lp-services-hero">
          <div className="lp-container lp-services-hero-inner">
            <p>Blog</p>
            <h1>Sneaker Guides &amp; Style Tips</h1>
            <span className="lp-divider" aria-hidden="true" />
            <p className="lp-services-intro">
              Sizing, care, spotting fakes, and what&apos;s worth buying -- from the team at Drip Emporium.
            </p>
          </div>
        </section>

        <section className="lp-container de-blog-grid">
          {posts.length === 0 ? (
            <div className="de-empty">
              <p>Nothing published yet -- check back soon.</p>
            </div>
          ) : (
            posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="de-blog-card">
                {post.coverImageUrl ? (
                  <div className="de-blog-card-media" style={{ backgroundImage: `url(${post.coverImageUrl})` }} />
                ) : null}
                <div className="de-blog-card-body">
                  <span className="de-blog-card-meta">
                    {formatBlogDate(post.publishedAt)} · {readingTime(post.body)} min read
                  </span>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt}</p>
                </div>
              </Link>
            ))
          )}
        </section>
      </main>
    </EliteLayout>
  );
}
