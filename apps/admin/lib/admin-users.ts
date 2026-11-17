import type { AdminRole } from '@colina/db';

/**
 * Why an admin account cannot be deleted, or `null` when it can.
 *
 * The UI only ever offers EDITOR rows for deletion, so this helper is the
 * server-side statement of the same policy:
 * - the acting admin can never delete itself;
 * - a SUPER_ADMIN account is never deletable from this area. When it is the
 *   only full admin the answer is specifically `last_admin`; with more than
 *   one it is still refused, because role management is not part of Stage 4b.
 */
export type AdminDeleteBlock = 'self' | 'last_admin' | 'protected_account';

export function adminDeleteBlock(input: {
  actorId: string;
  targetId: string;
  targetRole: AdminRole;
  superAdminCount: number;
}): AdminDeleteBlock | null {
  if (input.targetId === input.actorId) {
    return 'self';
  }
  if (input.targetRole === 'SUPER_ADMIN') {
    return input.superAdminCount <= 1 ? 'last_admin' : 'protected_account';
  }
  return null;
}
