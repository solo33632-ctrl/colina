import { getAdminSession } from './auth';

// Defense in depth (agent.md): every Server Action calls requireAdmin()
// itself — proxy.ts alone is not sufficient, since actions can be invoked
// directly. Both roles may manage content in this phase; finer-grained
// permissions (if ever needed) belong to Phase 12+.
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.id) {
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
    };
