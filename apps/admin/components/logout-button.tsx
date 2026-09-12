'use client';

import { signOut } from 'next-auth/react';
import { Button } from '@colina/ui';

export function LogoutButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => signOut({ callbackUrl: '/login' })}
    >
      Log out
    </Button>
  );
}
