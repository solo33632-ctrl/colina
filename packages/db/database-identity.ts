// Database identity for the gated `x-e2e-db` response header.
//
// This module is imported by both Next.js proxies (`apps/web/proxy.ts`,
// `apps/admin/proxy.ts`), which run on the Edge runtime. It must stay
// standalone and dependency-free: do NOT re-export it from `./index`, because
// the index constructs the Prisma client (Node-only).
//
// The value is only ever `host:port/dbname`; credentials in DATABASE_URL are
// deliberately dropped. The header exists so an e2e run can prove which
// database a server is attached to before any test body executes.

export const E2E_DB_HEADER = 'x-e2e-db';

export type DatabaseIdentityEnv = {
  DATABASE_URL?: string;
  E2E_EXPOSE_DB?: string;
  NODE_ENV?: string;
};

/**
 * `postgresql://user:password@host:5433/db` -> `host:5433/db`.
 *
 * A missing URL, an unparsable URL, a non-Postgres URL, or one without a
 * host/port/database name all return `unknown` — never a partial value.
 */
export function databaseIdentity(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    return 'unknown';
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return 'unknown';
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return 'unknown';
  }

  const database = parsed.pathname.replace(/^\/+/, '');
  if (!parsed.hostname || !parsed.port || !database) {
    return 'unknown';
  }

  return `${parsed.hostname}:${parsed.port}/${database}`;
}

/**
 * The response header to add, or `null` when it must not exist.
 *
 * Gated twice: the explicit opt-in must be exactly `1`, and production always
 * suppresses it even if the flag leaks into a production environment.
 */
export function e2eDatabaseHeader(
  env: DatabaseIdentityEnv
): { name: typeof E2E_DB_HEADER; value: string } | null {
  if (env.E2E_EXPOSE_DB !== '1' || env.NODE_ENV === 'production') {
    return null;
  }

  return {
    name: E2E_DB_HEADER,
    value: databaseIdentity(env.DATABASE_URL),
  };
}
