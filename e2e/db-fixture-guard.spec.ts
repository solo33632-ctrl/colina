import { test, expect } from '@playwright/test';
import { assertTestDatabase } from './db-fixture';

// The fixture helpers delete rows wholesale, so a mistaken DATABASE_URL must
// fail before the first statement runs — not after a child process has
// connected to the wrong database. These cases exercise the guard directly and
// never open a connection: the spec swaps the environment variable, checks the
// ruling, and puts it back.

const TEST_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/colina_test';
const REAL_DEV_URL = 'postgresql://postgres:postgres@localhost:5432/colina';

function withDatabaseUrl(url: string | undefined, run: () => void) {
  const original = process.env.DATABASE_URL;
  try {
    if (url === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = url;
    }
    run();
  } finally {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  }
}

test.describe('destructive fixture guard', () => {
  test('accepts the test database URL', () => {
    withDatabaseUrl(TEST_URL, () => {
      expect(() => assertTestDatabase()).not.toThrow();
    });
  });

  test('rejects a missing DATABASE_URL', () => {
    withDatabaseUrl(undefined, () => {
      expect(() => assertTestDatabase()).toThrow(/DATABASE_URL is not set/);
    });
  });

  test('rejects the real development database URL (5432/colina)', () => {
    withDatabaseUrl(REAL_DEV_URL, () => {
      expect(() => assertTestDatabase()).toThrow(
        /127\.0\.0\.1:5433\/colina_test/
      );
    });
  });

  test('rejects the test host and port with a different database name', () => {
    withDatabaseUrl(
      'postgresql://postgres:postgres@localhost:5433/colina',
      () => {
        expect(() => assertTestDatabase()).toThrow(/not the test database/);
      }
    );
  });
});
