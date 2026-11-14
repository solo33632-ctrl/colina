import { describe, expect, it } from 'vitest';
import {
  checkDatabaseSafety,
  isTestDatabaseIdentity,
  TEST_DATABASE_IDENTITY,
} from '../../../e2e/database-safety';

const TEST_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/colina_test';

function safeInput() {
  return {
    runnerDatabaseUrl: TEST_URL,
    webHeader: TEST_DATABASE_IDENTITY,
    adminHeader: TEST_DATABASE_IDENTITY,
  };
}

describe('isTestDatabaseIdentity', () => {
  it('accepts the test target with either local host spelling', () => {
    expect(isTestDatabaseIdentity(TEST_DATABASE_IDENTITY)).toBe(true);
    expect(isTestDatabaseIdentity('localhost:5433/colina_test')).toBe(true);
  });

  it('rejects wrong database, wrong port, unknown and missing', () => {
    expect(isTestDatabaseIdentity('127.0.0.1:5433/colina')).toBe(false);
    expect(isTestDatabaseIdentity('127.0.0.1:5432/colina_test')).toBe(false);
    expect(isTestDatabaseIdentity('unknown')).toBe(false);
    expect(isTestDatabaseIdentity(null)).toBe(false);
    expect(isTestDatabaseIdentity(undefined)).toBe(false);
  });
});

describe('checkDatabaseSafety', () => {
  it('passes when the runner and both headers use the test target', () => {
    expect(checkDatabaseSafety(safeInput())).toEqual([]);
  });

  it('passes for localhost URLs and headers too', () => {
    expect(
      checkDatabaseSafety({
        runnerDatabaseUrl:
          'postgresql://postgres:postgres@localhost:5433/colina_test',
        webHeader: 'localhost:5433/colina_test',
        adminHeader: 'localhost:5433/colina_test',
      })
    ).toEqual([]);
  });

  it('fails when the runner is on the wrong database', () => {
    expect(
      checkDatabaseSafety({
        ...safeInput(),
        runnerDatabaseUrl:
          'postgresql://postgres:postgres@127.0.0.1:5433/colina',
      })
    ).toEqual([
      {
        source: 'runner',
        actual: '127.0.0.1:5433/colina',
        reason: 'wrong-target',
      },
    ]);
  });

  it('fails when the runner is on the wrong port', () => {
    expect(
      checkDatabaseSafety({
        ...safeInput(),
        runnerDatabaseUrl:
          'postgresql://postgres:postgres@127.0.0.1:5432/colina_test',
      })
    ).toEqual([
      {
        source: 'runner',
        actual: '127.0.0.1:5432/colina_test',
        reason: 'wrong-target',
      },
    ]);
  });

  it('fails when the runner URL is missing or malformed', () => {
    expect(
      checkDatabaseSafety({ ...safeInput(), runnerDatabaseUrl: undefined })
    ).toEqual([{ source: 'runner', actual: 'unknown', reason: 'unknown' }]);
    expect(
      checkDatabaseSafety({ ...safeInput(), runnerDatabaseUrl: 'not-a-url' })
    ).toEqual([{ source: 'runner', actual: 'unknown', reason: 'unknown' }]);
  });

  it('fails on the wrong web database', () => {
    expect(
      checkDatabaseSafety({
        ...safeInput(),
        webHeader: '127.0.0.1:5433/colina',
      })
    ).toEqual([
      {
        source: 'web',
        actual: '127.0.0.1:5433/colina',
        reason: 'wrong-target',
      },
    ]);
  });

  it('fails on the wrong admin port', () => {
    expect(
      checkDatabaseSafety({
        ...safeInput(),
        adminHeader: '127.0.0.1:5432/colina_test',
      })
    ).toEqual([
      {
        source: 'admin',
        actual: '127.0.0.1:5432/colina_test',
        reason: 'wrong-target',
      },
    ]);
  });

  it('fails when a server header is missing', () => {
    expect(checkDatabaseSafety({ ...safeInput(), webHeader: null })).toEqual([
      { source: 'web', actual: '<missing>', reason: 'missing' },
    ]);
    expect(checkDatabaseSafety({ ...safeInput(), adminHeader: '' })).toEqual([
      { source: 'admin', actual: '<missing>', reason: 'missing' },
    ]);
  });

  it('fails when a server reports an unknown database', () => {
    expect(
      checkDatabaseSafety({ ...safeInput(), webHeader: 'unknown' })
    ).toEqual([{ source: 'web', actual: 'unknown', reason: 'unknown' }]);
  });

  it('reports every problem at once', () => {
    const problems = checkDatabaseSafety({
      runnerDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/colina',
      webHeader: 'unknown',
      adminHeader: null,
    });

    expect(problems.map((problem) => problem.source)).toEqual([
      'runner',
      'web',
      'admin',
    ]);
  });
});
