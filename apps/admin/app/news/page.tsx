import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'News — Colina Admin',
};

export default async function NewsPage() {
  const posts = await prisma.newsPost.findMany({
    orderBy: { publishedAt: 'desc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">News</h1>
          <Button href="/news/new" size="sm">
            New post
          </Button>
        </div>
        {posts.length === 0 ? (
          <Card className="mt-6" description="No posts yet." />
        ) : (
          <ul className="mt-6 grid gap-4">
            {posts.map((post) => (
              <li key={post.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {post.titleEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {post.slug} ·{' '}
                        {post.publishedAt.toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <a
                      href={`/news/${post.id}/edit`}
                      className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      Edit
                    </a>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
