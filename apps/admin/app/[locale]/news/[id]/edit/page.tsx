import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { DeleteButton } from '@/components/delete-button';
import { NewsForm } from '@/components/news-form';
import { deleteNews } from '@/lib/actions/news';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'News', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditNewsPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations('News');
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
          label={t('delete.button')}
          confirmMessage={t('delete.confirm')}
          redirectTo="/news"
          onDelete={() => deleteNews(post.id)}
        />
      </Container>
    </main>
  );
}
