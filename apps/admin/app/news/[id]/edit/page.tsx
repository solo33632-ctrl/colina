import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { DeleteButton } from '@/components/delete-button';
import { NewsForm } from '@/components/news-form';
import { deleteNews } from '@/lib/actions/news';

export const metadata = {
  title: 'Edit post — Colina Admin',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditNewsPage({ params }: Props) {
  const { id } = await params;
  const post = await prisma.newsPost.findUnique({ where: { id } });
  if (!post) {
    notFound();
  }

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <NewsForm
          mode="edit"
          newsId={post.id}
          defaultValues={{
            slug: post.slug,
            titleAr: post.titleAr,
            titleEn: post.titleEn,
            bodyAr: post.bodyAr,
            bodyEn: post.bodyEn,
            image: post.image ?? '',
            publishedAt: post.publishedAt.toISOString().slice(0, 10),
          }}
        />
        <DeleteButton
          label="Delete post"
          confirmMessage="Delete this post? This cannot be undone."
          redirectTo="/news"
          onDelete={() => deleteNews(post.id)}
        />
      </Container>
    </main>
  );
}
