'use client';

import { signOut } from 'next-auth/react';
import { useLocale } from 'next-intl';
import { Button } from '@colina/ui';

export function LogoutButton() {
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
      Log out
    </Button>
  );
}
