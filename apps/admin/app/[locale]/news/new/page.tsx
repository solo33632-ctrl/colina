import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { NewsForm } from '@/components/news-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'News', 'form.createTitle');
}

export default async function NewNewsPage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('News'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/news"
          sectionLabel={nav('news')}
          current={t('form.createTitle')}
        />
        <NewsForm mode="create" />
      </Container>
    </main>
  );
}
