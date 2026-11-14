import { databaseIdentity } from '../packages/db/database-identity';

// Pure comparison logic for the Playwright global safety check. Kept free of
// network and filesystem access so it can be unit-tested directly.

export const TEST_DATABASE_IDENTITY = '127.0.0.1:5433/colina_test';
export const TEST_DATABASE_IDENTITIES = [
  TEST_DATABASE_IDENTITY,
  'localhost:5433/colina_test',
] as const;

export function isTestDatabaseIdentity(
  value: string | null | undefined
): boolean {
  return (
    value !== null &&
    value !== undefined &&
    (TEST_DATABASE_IDENTITIES as readonly string[]).includes(value)
  );
}

export type DatabaseSafetySource = 'runner' | 'web' | 'admin';

export type DatabaseSafetyProblem = {
  source: DatabaseSafetySource;
  /** `unknown`, a wrong `host:port/db`, or `<missing>` for no header. */
  actual: string;
  reason: 'missing' | 'unknown' | 'wrong-target';
};

export type DatabaseSafetyInput = {
  runnerDatabaseUrl: string | undefined;
  webHeader: string | null | undefined;
  adminHeader: string | null | undefined;
};

/**
 * Returns every reason the run must not start; an empty array means safe.
 *
 * The runner is compared by parsing DATABASE_URL (credentials are dropped by
 * databaseIdentity). Servers are compared on the already-extracted
 * `x-e2e-db` header. Both local host spellings of the test database are
 * accepted, exactly like e2e/db-fixture.ts assertTestDatabase.
 */
export function checkDatabaseSafety(
  input: DatabaseSafetyInput
): DatabaseSafetyProblem[] {
  const problems: DatabaseSafetyProblem[] = [];

  const runnerIdentity = databaseIdentity(input.runnerDatabaseUrl);
  if (!isTestDatabaseIdentity(runnerIdentity)) {
    problems.push({
      source: 'runner',
      actual: runnerIdentity,
      reason: runnerIdentity === 'unknown' ? 'unknown' : 'wrong-target',
    });
  }

  const headers: {
    source: 'web' | 'admin';
    value: string | null | undefined;
  }[] = [
    { source: 'web', value: input.webHeader },
    { source: 'admin', value: input.adminHeader },
  ];

  for (const { source, value } of headers) {
    if (value === null || value === undefined || value === '') {
      problems.push({ source, actual: '<missing>', reason: 'missing' });
    } else if (!isTestDatabaseIdentity(value)) {
      problems.push({
        source,
        actual: value,
        reason: value === 'unknown' ? 'unknown' : 'wrong-target',
      });
    }
  }

  return problems;
}
