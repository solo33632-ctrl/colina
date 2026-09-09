import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { LanguageSwitcher } from './language-switcher';

// Public-site header (app-specific — the admin header lives in apps/admin).
// Nav items are plain text for now: the routes they point to arrive in
// Phases 4–7, so no dead links are rendered in this phase.
export async function SiteHeader() {
  const site = await getTranslations('Site');
  const nav = await getTranslations('Nav');
  const items = [nav('home'), nav('machines'), nav('services'), nav('contact')];

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center gap-6">
        <span className="text-lg font-bold text-brand-800">{site('name')}</span>
        <nav aria-label={nav('main')} className="hidden sm:block">
          <ul className="flex items-center gap-6">
            {items.map((item) => (
              <li key={item} className="text-sm text-stone-600">
                {item}
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto">
          <LanguageSwitcher />
        </div>
      </Container>
    </header>
  );
}
