import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { ContactForm } from './contact-form';

// UI only — submission wiring (API route, Prisma write, email) is Phase 8.
export async function ContactSection() {
  const t = await getTranslations('Contact');

  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      className="border-t border-stone-200 bg-white"
    >
      <Container className="py-16">
        <h2
          id="contact-heading"
          className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
        >
          {t('heading')}
        </h2>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        <ContactForm />
      </Container>
    </section>
  );
}
