'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { usePathname, useRouter } from '@/i18n/navigation';

// Toggles between `ar` and `en` while staying on the current page:
// `usePathname` returns the locale-unprefixed path, and `router.replace`
// with `{locale}` re-resolves it under the other locale.
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('LanguageSwitcher');
  const pathname = usePathname();
  const router = useRouter();

  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-stone-500 md:inline">
        {t('label')}:
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => router.replace(pathname, { locale: otherLocale })}
      >
        {otherLocale === 'ar' ? t('arabic') : t('english')}
      </Button>
    </div>
  );
}
