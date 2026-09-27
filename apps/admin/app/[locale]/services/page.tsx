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
  return sectionMetadata(locale, 'Services', 'heading');
}

export default async function ServicesPage() {
  const locale = await getLocale();
  const t = await getTranslations('Services');
  const common = await getTranslations('Common');
  const services = await prisma.maintenanceService.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/services/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        {services.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <ul className="mt-6 grid gap-4">
            {services.map((service) => (
              <li key={service.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {service.titleEn}
                      </p>
                      <p className="text-sm text-stone-500">{service.slug}</p>
                    </div>
                    <Link
                      href={`/services/${service.id}/edit`}
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
