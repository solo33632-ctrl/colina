import type { Metadata } from 'next';
import { Container } from '@colina/ui';
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

export default function NewNewsPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <NewsForm mode="create" />
      </Container>
    </main>
  );
}
