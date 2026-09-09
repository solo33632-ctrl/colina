import { getTranslations } from 'next-intl/server';
import type { Partner } from '@colina/db';
import { Container } from '@colina/ui';
import { ImageWithFallback } from './image-with-fallback';

type PartnersStripProps = {
  partners: Partner[];
  locale: 'ar' | 'en';
};

export async function PartnersStrip({ partners, locale }: PartnersStripProps) {
  const t = await getTranslations('Partners');

  return (
    <section aria-labelledby="partners-heading">
      <Container className="py-16">
        <h2
          id="partners-heading"
          className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
        >
          {t('heading')}
        </h2>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        {partners.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
        ) : (
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-6">
            {partners.map((partner) => {
              const name = locale === 'ar' ? partner.nameAr : partner.nameEn;
              return (
                <li
                  key={partner.id}
                  className="w-36 overflow-hidden rounded-xl border border-stone-200 bg-white"
                >
                  <ImageWithFallback
                    src={partner.logo}
                    alt={name}
                    fallbackClassName="flex aspect-video items-center justify-center bg-stone-100"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </section>
  );
}
