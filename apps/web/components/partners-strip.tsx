import { getTranslations } from 'next-intl/server';
import type { Partner } from '@colina/db';
import { Container } from '@colina/ui';
import { PartnerCard } from './partner-card';
import { Reveal } from './reveal';

type PartnersStripProps = {
  partners: Partner[];
  locale: 'ar' | 'en';
  /**
   * Which message namespace supplies the heading. The home strip and the
   * listing page each have their own copy, so each keeps its own strings.
   */
  namespace?: 'Partners' | 'PartnersPage';
  /**
   * The listing page needs this as its `h1`; the home section is an `h2`
   * under the page's single `h1`.
   */
  headingLevel?: 'h1' | 'h2';
};

/**
 * Below this many partners the logos are laid out as a static centred grid
 * rather than a marquee.
 *
 * The loop is seamless because the strip is rendered twice, so one full pass
 * carries every logo at least once — but with only a few of them the repeated
 * pass is most of what is on screen. Two logos looping reads as one logo
 * blinking in and out; four reads as a carousel nobody asked for. Five is the
 * point where a single pass is comfortably wider than a viewport, which is
 * what makes the movement read as a strip of partners rather than a carousel.
 */
const MARQUEE_MIN_PARTNERS = 5;

/**
 * How long one full pass takes, stepped by how many partners are in the track.
 *
 * The travel distance is the width of the strip, and the strip grows by one
 * card (~232px) per partner, so a single fixed duration would make five logos
 * crawl and fifteen blur past. Stepping the duration with the count holds the
 * speed roughly constant instead. The steps are named classes rather than a
 * computed `duration-[${n}s]`, which Tailwind's static extraction could not
 * see; the timings themselves live in globals.css next to the keyframes.
 */
const LOOP_SPEED_CLASSES = [
  { upTo: 6, className: 'colina-partners-loop-1' },
  { upTo: 9, className: 'colina-partners-loop-2' },
  { upTo: 13, className: 'colina-partners-loop-3' },
  { upTo: 17, className: 'colina-partners-loop-4' },
  { upTo: Number.POSITIVE_INFINITY, className: 'colina-partners-loop-5' },
];

function loopSpeedClass(count: number): string {
  const step = LOOP_SPEED_CLASSES.find((entry) => count <= entry.upTo);
  return step?.className ?? 'colina-partners-loop-5';
}

/**
 * The partners section: a heading over the admin-curated logos, used both as
 * the home page's strip and as the whole of the /partners listing page.
 *
 * The logos scroll in a continuous horizontal marquee, which is plain CSS
 * (see globals.css) with no JavaScript and no new dependency. A visitor who
 * asks for reduced motion gets the same logos as a static wrapped grid instead,
 * and the marquee pauses on hover and on keyboard focus.
 */
export async function PartnersStrip({
  partners,
  locale,
  namespace = 'Partners',
  headingLevel = 'h2',
}: PartnersStripProps) {
  const t = await getTranslations(namespace);
  const marquee = partners.length >= MARQUEE_MIN_PARTNERS;
  const Heading = headingLevel;

  return (
    <section aria-labelledby="partners-heading">
      <Container className="py-16">
        <Reveal>
          <Heading
            id="partners-heading"
            className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
          >
            {t('heading')}
          </Heading>
          <p className="mx-auto mt-2 max-w-2xl text-center text-stone-600">
            {t('subheading')}
          </p>
          {/* A hairline in the brand orange, echoing the rule under the hero.
              Purely decorative. */}
          <div
            aria-hidden="true"
            className="mx-auto mt-6 h-0.5 w-16 rounded-full bg-brand-500"
          />
        </Reveal>

        {partners.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
        ) : marquee ? (
          // `dir="ltr"` on the strip itself, deliberately. The logos are
          // wordmarks in a fixed order and the loop is a fixed -50% offset;
          // letting an RTL page lay the track out right-to-left would anchor
          // it to the other edge and the pass would run off the wrong side.
          // The heading and subtitle stay outside this element and keep the
          // page's normal direction, so all the text still reads correctly.
          <div className="colina-partners-marquee mt-12" dir="ltr">
            <ul
              className={`colina-partners-track ${loopSpeedClass(partners.length)}`}
            >
              {partners.map((partner) => (
                <li key={partner.id} className="me-6">
                  <PartnerCard partner={partner} locale={locale} />
                </li>
              ))}
              {/* The same logos a second time, immediately after the first
                  pass. This is what makes the loop seamless: -50% of the track
                  lands exactly where this copy starts, so the reset is
                  invisible. Hidden from assistive tech so a partner is
                  announced once, not twice. */}
              {partners.map((partner) => (
                <li
                  key={`${partner.id}-clone`}
                  data-clone=""
                  aria-hidden="true"
                  className="me-6"
                >
                  <PartnerCard partner={partner} locale={locale} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="mt-12 flex flex-wrap items-start justify-center gap-6">
            {partners.map((partner) => (
              <li key={partner.id}>
                <PartnerCard partner={partner} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
