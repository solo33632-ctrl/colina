import { getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';

// Text-only hero on a brand background — no photography exists yet
// (real media arrives with Phase 0 content).
//
// Deliberately NOT wrapped in `Reveal`. The hero is this page's Largest
// Contentful Paint candidate, and Chrome excludes an element painted at
// `opacity: 0` from LCP for good: it records the candidate at the element's
// first paint, and a later composited opacity change does not re-qualify it.
// Fading the hero in therefore does not just delay LCP, it loses the hero
// altogether and leaves a 58x40 header logo holding the metric.
//
// The hero's entrance is the brand overlay lifting off it, which reads
// identically and costs nothing. The entrance animation lives on the
// sections below the fold, which are not LCP candidates.
export async function HeroSection() {
  const t = await getTranslations('Hero');

  return (
    <section className="bg-brand-900">
      <Container className="py-20 text-center sm:py-28">
        <h1 className="mx-auto max-w-3xl text-3xl font-bold text-white sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-brand-100 sm:text-lg">
          {t('subtitle')}
        </p>
        <div className="mt-8 flex justify-center">
          <Button href="#contact" size="lg">
            {t('cta')}
          </Button>
        </div>
      </Container>
      <div aria-hidden="true" className="h-1 bg-brand-500" />
    </section>
  );
}
