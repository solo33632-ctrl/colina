import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';

// Public-site footer (app-specific — the admin footer lives in apps/admin).
export async function SiteFooter() {
  const site = await getTranslations('Site');
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t border-stone-200 bg-white">
      <Container className="py-6">
        <p className="text-center text-sm text-stone-500">
          © {new Date().getFullYear()} {site('name')} — {t('rights')}
        </p>
        <p className="mt-1 text-center text-xs text-stone-400">
          {site('tagline')}
        </p>
      </Container>
    </footer>
  );
}
