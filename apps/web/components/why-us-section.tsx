import { getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';

// Static placeholder strengths — real copy arrives with Phase 0 content.
// Tuple of literal keys keeps `t()` type-safe (see i18n/global.ts).
const FEATURES = ['feature1', 'feature2', 'feature3', 'feature4'] as const;

export async function WhyUsSection() {
  const t = await getTranslations('WhyUs');

  return (
    <section
      aria-labelledby="why-us-heading"
      className="border-y border-stone-200 bg-white"
    >
      <Container className="py-16">
        <h2
          id="why-us-heading"
          className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
        >
          {t('heading')}
        </h2>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature}>
              <Card
                className="h-full"
                title={t(`${feature}Title`)}
                description={t(`${feature}Text`)}
              />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
