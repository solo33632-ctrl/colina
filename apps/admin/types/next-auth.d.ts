import type { AdminRole } from '@colina/db';
import type { DefaultSession } from 'next-auth';

// Session carries id + role so later phases check permissions without an
// extra DB round-trip. Role comes from the JWT (set at login from the
// AdminUser row), never from client input.
//
// Stage 2b adds `sessionVersion`: the value the token was issued with. It is
// optional on the session type because tokens issued before the column
// existed have no claim — they are treated as revoked (one re-login).
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: AdminRole;
      sessionVersion?: number;
    } & DefaultSession['user'];
  }
  interface User {
    role?: AdminRole;
    sessionVersion?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: AdminRole;
    sessionVersion?: number;
  }
}
