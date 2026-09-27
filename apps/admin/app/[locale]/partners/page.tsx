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
  return sectionMetadata(locale, 'Partners', 'heading');
}

export default async function PartnersPage() {
  const locale = await getLocale();
  const t = await getTranslations('Partners');
  const common = await getTranslations('Common');
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/partners/new' })}
            size="sm"
          >
            New partner
          </Button>
        </div>
        {partners.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <ul className="mt-6 grid gap-4">
            {partners.map((partner) => (
              <li key={partner.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {partner.nameEn}
                      </p>
                      <p className="text-sm text-stone-500">{partner.nameAr}</p>
                    </div>
                    <Link
                      href={`/partners/${partner.id}/edit`}
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
