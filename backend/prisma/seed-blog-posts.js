/**
 * One-time loader for the launch blog articles, run by hand -- not part of
 * seed.js's demo-data path or bootstrap.js's every-boot config seeding.
 *
 * Idempotent on slug: safe to re-run (e.g. after adding a new article to
 * seed-data/blog-posts.json) without duplicating or overwriting posts staff
 * have already edited through the portal.
 *
 * Usage: node prisma/seed-blog-posts.js
 */
const { PrismaClient } = require('@prisma/client');
const posts = require('./seed-data/blog-posts.json');

const prisma = new PrismaClient();

async function main() {
  for (const post of posts) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: post.slug } });
    if (existing) {
      console.log(`Skipping "${post.slug}" -- already exists.`);
      continue;
    }
    await prisma.blogPost.create({
      data: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body: post.body,
        author: 'Drip Emporium',
        publishedAt: null, // draft -- staff review before publishing
      },
    });
    console.log(`Created draft: ${post.title}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
