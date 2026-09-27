import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Categories', 'heading');
}

export default async function CategoriesPage() {
  const locale = await getLocale();
  const t = await getTranslations('Categories');
  const common = await getTranslations('Common');
  const categories = await prisma.machineCategory.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { machines: true } } },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/categories/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        {categories.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <ul className="mt-6 grid gap-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {category.nameEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {category.slug} ·{' '}
                        {t('machineCount', {
                          count: category._count.machines,
                        })}
                      </p>
                    </div>
                    <Link
                      href={`/categories/${category.id}/edit`}
                      className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {common('edit')}
                    </Link>
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
