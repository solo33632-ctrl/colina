import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';

export async function AdminFooter() {
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t border-stone-200 bg-white">
      <Container className="py-6">
        <p className="text-center text-sm text-stone-500">
          {t('internalUse', { year: new Date().getFullYear() })}
        </p>
      </Container>
    </footer>
  );
}
