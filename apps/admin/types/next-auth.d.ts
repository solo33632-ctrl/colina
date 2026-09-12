import type { AdminRole } from '@colina/db';
import type { DefaultSession } from 'next-auth';

// Session carries id + role so later phases check permissions without an
// extra DB round-trip. Role comes from the JWT (set at login from the
// AdminUser row), never from client input.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: AdminRole;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: AdminRole;
  }
}
