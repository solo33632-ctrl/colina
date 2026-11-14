import { describe, expect, it } from 'vitest';
import {
  databaseIdentity,
  e2eDatabaseHeader,
  E2E_DB_HEADER,
} from '@colina/db/database-identity';

const TEST_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/colina_test';
const TEST_IDENTITY = '127.0.0.1:5433/colina_test';

describe('databaseIdentity', () => {
  it('reduces a database URL to host:port/database', () => {
    expect(databaseIdentity(TEST_URL)).toBe(TEST_IDENTITY);
  });

  it('accepts the postgres scheme and localhost', () => {
    expect(
      databaseIdentity('postgres://admin:secret@localhost:5433/colina_test')
    ).toBe('localhost:5433/colina_test');
  });

  it('never includes the username or password', () => {
    const identity = databaseIdentity(
      'postgresql://db-admin:sup3r-secret@db.internal:5432/production'
    );

    expect(identity).toBe('db.internal:5432/production');
    expect(identity).not.toContain('db-admin');
    expect(identity).not.toContain('sup3r-secret');
    expect(identity).not.toContain('@');
  });

  it('returns unknown for a missing URL', () => {
    expect(databaseIdentity(undefined)).toBe('unknown');
    expect(databaseIdentity('')).toBe('unknown');
  });

  it('returns unknown for a malformed URL', () => {
    expect(databaseIdentity('not a database url')).toBe('unknown');
    expect(databaseIdentity('postgresql://')).toBe('unknown');
  });

  it('returns unknown for a non-Postgres URL', () => {
    expect(databaseIdentity('mysql://user:pass@127.0.0.1:3306/db')).toBe(
      'unknown'
    );
  });

  it('returns unknown when the port or database name is missing', () => {
    expect(
      databaseIdentity('postgresql://user:pass@127.0.0.1/colina_test')
    ).toBe('unknown');
    expect(databaseIdentity('postgresql://user:pass@127.0.0.1:5433')).toBe(
      'unknown'
    );
  });
});

describe('e2eDatabaseHeader', () => {
  it('is absent when the flag is unset', () => {
    expect(
      e2eDatabaseHeader({
        DATABASE_URL: TEST_URL,
        NODE_ENV: 'development',
      })
    ).toBeNull();
  });

  it('is absent for any flag value other than exactly 1', () => {
    expect(
      e2eDatabaseHeader({
        DATABASE_URL: TEST_URL,
        NODE_ENV: 'development',
        E2E_EXPOSE_DB: 'true',
      })
    ).toBeNull();
    expect(
      e2eDatabaseHeader({
        DATABASE_URL: TEST_URL,
        NODE_ENV: 'development',
        E2E_EXPOSE_DB: '0',
      })
    ).toBeNull();
  });

  it('is absent in production even when the flag is 1', () => {
    expect(
      e2eDatabaseHeader({
        DATABASE_URL: TEST_URL,
        NODE_ENV: 'production',
        E2E_EXPOSE_DB: '1',
      })
    ).toBeNull();
  });

  it('is present in development with the flag, carrying the test identity', () => {
    expect(
      e2eDatabaseHeader({
        DATABASE_URL: TEST_URL,
        NODE_ENV: 'development',
        E2E_EXPOSE_DB: '1',
      })
    ).toEqual({ name: E2E_DB_HEADER, value: TEST_IDENTITY });
  });

  it('exposes unknown for a malformed URL, never credentials', () => {
    const header = e2eDatabaseHeader({
      DATABASE_URL: 'postgresql://db-admin:sup3r-secret@',
      NODE_ENV: 'development',
      E2E_EXPOSE_DB: '1',
    });

    expect(header).toEqual({ name: 'x-e2e-db', value: 'unknown' });
    expect(header?.value).not.toContain('db-admin');
    expect(header?.value).not.toContain('sup3r-secret');
  });
});
