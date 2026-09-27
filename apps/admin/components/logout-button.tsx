'use client';

import { signOut } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@colina/ui';

export function LogoutButton() {
  const t = useTranslations('Auth');
  // signOut posts to the unprefixed `/api/auth/signout`, so the callback URL
  // is built here with the active locale: logging out must not bounce the
  // admin into the other language.
  const locale = useLocale();

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
    >
      {t('logout')}
    </Button>
  );
}
