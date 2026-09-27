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
  return sectionMetadata(locale, 'Machines', 'heading');
}

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function MachinesPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Machines');
  const common = await getTranslations('Common');
  const { category: categoryFilter } = await searchParams;
  const [categories, machines] = await Promise.all([
    prisma.machineCategory.findMany({ orderBy: { nameEn: 'asc' } }),
    prisma.machine.findMany({
      where: categoryFilter ? { categoryId: categoryFilter } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { category: { select: { nameEn: true } } },
    }),
  ]);

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/machines/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        {/* GET form: submitting to the current URL keeps the locale prefix. */}
        <form method="get" className="mt-6 flex items-end gap-3">
          <div>
            <label
              htmlFor="machine-category-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByCategory')}
            </label>
            <select
              id="machine-category-filter"
              name="category"
              defaultValue={categoryFilter ?? ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">{common('allCategories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameEn}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" size="sm">
            {common('filter')}
          </Button>
        </form>
        {machines.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <ul className="mt-6 grid gap-4">
            {machines.map((machine) => (
              <li key={machine.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {machine.nameEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {machine.slug} · {machine.category.nameEn}
                      </p>
                    </div>
                    <Link
                      href={`/machines/${machine.id}/edit`}
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
