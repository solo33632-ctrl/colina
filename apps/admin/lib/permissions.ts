import type { AdminRole } from '@colina/db';
import { requireAdmin, type AdminSession } from './admin-action';

// Stage 4a: the one place that answers "may this admin do X?".
//
// Every Server Action and API route states the capability it needs, and the
// role map below is the only place a role is translated into powers. A route
// that forgets to name a capability is caught by the guard test in
// `lib/permissions.test.ts`; a capability that no role holds is a dead entry.
//
// EDITOR deliberately holds only the three machine/category capabilities:
// everything else is default-deny. SUPER_ADMIN holds every capability, which
// is what keeps the existing full-admin behavior unchanged.
export const CAPABILITIES = [
  // Machines and categories (the editor's whole area).
  'machines:write',
  'categories:write',
  'uploads:machine-media',
  // Media contexts outside machines/categories. Full admin only, so an
  // editor cannot repurpose the upload action for news/partners/etc. even if
  // it guesses a valid target.
  'uploads:other',
  // Everything else in the panel.
  'dashboard:read',
  'leads:write',
  'settings:write',
  'partners:write',
  'news:write',
  'agents:write',
  'services:write',
  'maintenance-categories:write',
  'maintenance-showcase:write',
  'insights:read',
  'audit:read',
  // Stage 4b: admin accounts management and per-user activity. SUPER_ADMIN
  // only; the editor list stays deliberately short.
  'users:manage',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// EDITOR is intentionally a short list. Adding a capability here grants every
// editor account that power, so it must be a product decision, not a shortcut.
const EDITOR_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'machines:write',
  'categories:write',
  'uploads:machine-media',
]);

const ROLE_CAPABILITIES: Record<AdminRole, ReadonlySet<Capability>> = {
  SUPER_ADMIN: new Set(CAPABILITIES),
  EDITOR: EDITOR_CAPABILITIES,
};

/** The capabilities a role holds, as a read-only set. */
export function capabilitiesFor(role: AdminRole): ReadonlySet<Capability> {
  return ROLE_CAPABILITIES[role];
}

/** Pure role check used by both the server helpers and the unit tests. */
export function roleCan(role: AdminRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/**
 * Authenticates the request and checks the capability.
 *
 * `requireAdmin()` is the project's verified-session helper: it is built on
 * `getVerifiedAdminSession`, so the AdminUser row is re-read and the token's
 * `sessionVersion` and role must still match (an account deleted, revoked or
 * demoted after sign-in is rejected here). It is cached per request, so the
 * extra call costs no second query.
 *
 * Returns null for both "no session" and "session without the capability".
 * That is deliberate: callers surface one generic denial, never a hint about
 * which role the account has.
 */
export async function requirePermission(
  capability: Capability
): Promise<AdminSession | null> {
  const session = await requireAdmin();
  if (!session) {
    return null;
  }
  if (!roleCan(session.user.role, capability)) {
    return null;
  }
  return session;
}

/** The ownership shape both owned entities share. */
export type OwnedEntity = {
  createdById: string | null;
};

/**
 * The single ownership rule for machines and machine categories.
 *
 * - SUPER_ADMIN may modify everything, including pre-existing rows whose
 *   creator is null.
 * - EDITOR may modify only rows whose `createdById` is exactly their own id.
 *   Null means "created before Stage 4a, or creator deleted": denied.
 *
 * Callers must load the row from the database first — never trust an id from
 * the client without this check. The return value is a boolean so actions can
 * answer with their uniform result object; pages use the same function to
 * decide between rendering and `notFound()`.
 */
export function assertCanModify(
  session: AdminSession,
  entity: OwnedEntity
): boolean {
  if (session.user.role === 'SUPER_ADMIN') {
    return true;
  }
  return entity.createdById !== null && entity.createdById === session.user.id;
}

/** Readable alias for call sites that phrase the question as a predicate. */
export const canModifyEntity = assertCanModify;
