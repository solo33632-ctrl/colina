import { cache } from 'react';
import { prisma, type AdminRole } from '@colina/db';
import { getAdminSession } from './auth';

// Stage 2b: a session is only trusted after its claims are checked against
// the AdminUser row. The JWT signature proves the token was issued by us, not
// that the account still exists, still has that role, or still accepts the
// token it was signed with (password resets bump `sessionVersion`).
//
// `cache()` keeps this to one database read per request: the locale layout,
// the app shell and any page/action helper in the same render share the
// result. Server Actions reuse it too when the action is invoked from a page
// render.
export const getVerifiedAdminSession = cache(async () => {
  const session = await getAdminSession();
  const tokenUser = session?.user;
  if (!tokenUser?.id) {
    return null;
  }

  // Tokens issued before Stage 2b carry no version claim. They are treated
  // as revoked, which forces exactly one re-login after the migration.
  const tokenVersion = tokenUser.sessionVersion;
  if (typeof tokenVersion !== 'number') {
    return null;
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: tokenUser.id },
    select: { id: true, email: true, role: true, sessionVersion: true },
  });

  // Deleted account, bumped credential version, or a role change made after
  // the token was issued: all reject with the same generic result the
  // actions already return (`{ ok: false, error: 'unauthorized' }`).
  if (!user) {
    return null;
  }
  if (user.sessionVersion !== tokenVersion) {
    return null;
  }
  if (user.role !== tokenUser.role) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role as AdminRole,
    },
  };
});

// Defense in depth (agent.md): every Server Action calls requireAdmin()
// itself — proxy.ts alone is not sufficient, since actions can be invoked
// directly. Both roles may manage content in this phase; finer-grained
// permissions (if ever needed) belong to Phase 12+.
export async function requireAdmin() {
  return getVerifiedAdminSession();
}

// First role gate in the project (Phase 12): the audit log is
// SUPER_ADMIN-only. Returns the session for super-admins, null for
// everyone else (including plain authenticated editors) — callers render
// an explanatory "not authorized" page, never a bare 403.
export async function requireSuperAdmin() {
  const session = await requireAdmin();
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return null;
  }
  return session;
}

export type AdminSession = NonNullable<
  Awaited<ReturnType<typeof requireAdmin>>
>;

// Uniform Server Action result: UI distinguishes cases by `error` code,
// never by matching message text.
export type ActionResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      issues?: { field: string; message: string }[];
      machineCount?: number;
      itemCount?: number;
    };
