import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
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
  const locale = await getLocale();
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');
  const post = await prisma.newsPost.findUnique({ where: { id } });
  if (!post) {
    notFound();
  }

  const name =
    locale === 'ar'
      ? post.titleAr || post.titleEn
      : post.titleEn || post.titleAr;

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/news"
          sectionLabel={nav('news')}
          current={common('editNamed', { name })}
        />
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
          itemName={
            locale === 'ar'
              ? post.titleAr || post.titleEn
              : post.titleEn || post.titleAr
          }
          redirectTo="/news"
          onDelete={deleteNews.bind(null, post.id)}
        />
      </Container>
    </main>
  );
}
