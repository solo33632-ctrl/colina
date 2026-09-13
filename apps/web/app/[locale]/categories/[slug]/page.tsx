import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { MachineCard } from '@/components/machine-card';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateStaticParams() {
  const categories = await prisma.machineCategory.findMany({
    select: { slug: true },
  });
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const category = await prisma.machineCategory.findUnique({
    where: { slug },
  });
  if (!category) {
    return {};
  }
  return {
    title: locale === 'ar' ? category.nameAr : category.nameEn,
    description:
      locale === 'ar' ? category.descriptionAr : category.descriptionEn,
    alternates: await localeAlternates(`/categories/${slug}`, locale),
  };
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('CategoryPage');
  const category = await prisma.machineCategory.findUnique({
    where: { slug },
    include: {
      machines: {
        orderBy: { createdAt: 'asc' },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
        },
      },
    },
  });

  if (!category) {
    notFound();
  }

  const name = locale === 'ar' ? category.nameAr : category.nameEn;
  const description =
    locale === 'ar' ? category.descriptionAr : category.descriptionEn;

  return (
    <main>
      <Container className="py-16">
        <Link
          href="/categories"
          className="text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {t('backToCategories')}
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-stone-900 sm:text-3xl">
          {name}
        </h1>
        <p className="mt-2 max-w-3xl text-stone-600">{description}</p>
        <h2 className="mt-10 text-xl font-semibold text-stone-900">
          {t('machinesHeading')}
        </h2>
        {category.machines.length === 0 ? (
          <p className="mt-4 text-stone-500">{t('machinesEmpty')}</p>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {category.machines.map((machine) => (
              <li key={machine.id}>
                <MachineCard machine={machine} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
