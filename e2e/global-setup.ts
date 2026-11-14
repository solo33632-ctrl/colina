import { request, type APIRequestContext } from '@playwright/test';
import {
  checkDatabaseSafety,
  TEST_DATABASE_IDENTITY,
  type DatabaseSafetyProblem,
} from './database-safety';
import { resetRateLimitBuckets } from './db-fixture';

// Runs before every Playwright invocation, including a single-spec run. There
// is deliberately no skip flag: if either server cannot prove it is attached
// to the test database, or the runner's own DATABASE_URL is not the test
// target, no test body may execute.

const WEB_CHECK_URL = `${process.env.WEB_URL ?? 'http://localhost:3000'}/en`;
const ADMIN_CHECK_URL = `${process.env.ADMIN_URL ?? 'http://localhost:3001'}/en/login`;

type HeaderResult = {
  value: string | null;
  error: string | null;
};

async function readDatabaseHeader(
  api: APIRequestContext,
  url: string
): Promise<HeaderResult> {
  try {
    const response = await api.get(url, {
      failOnStatusCode: false,
      timeout: 15_000,
    });
    return { value: response.headers()['x-e2e-db'] ?? null, error: null };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function describeProblem(
  problem: DatabaseSafetyProblem,
  errors: { web: string | null; admin: string | null }
): string {
  if (problem.source === 'runner') {
    if (problem.reason === 'unknown') {
      return 'Runner DATABASE_URL: missing or malformed (expected 127.0.0.1:5433/colina_test or localhost:5433/colina_test).';
    }
    return `Runner DATABASE_URL: points at "${problem.actual}", expected ${TEST_DATABASE_IDENTITY} (or localhost:5433/colina_test).`;
  }

  const label =
    problem.source === 'web'
      ? `Web ${WEB_CHECK_URL}`
      : `Admin ${ADMIN_CHECK_URL}`;
  const error = errors[problem.source];

  if (problem.reason === 'missing') {
    return `${label}: no x-e2e-db header${error ? ` (${error})` : ''}. The server was not started with E2E_EXPOSE_DB=1, or it is not answering.`;
  }
  if (problem.reason === 'unknown') {
    return `${label}: x-e2e-db is "unknown" — the server's DATABASE_URL is missing or malformed.`;
  }
  return `${label}: x-e2e-db is "${problem.actual}", expected ${TEST_DATABASE_IDENTITY} (or localhost:5433/colina_test).`;
}

function safetyFailureMessage(
  problems: DatabaseSafetyProblem[],
  errors: { web: string | null; admin: string | null }
): string {
  return [
    'E2E SAFETY CHECK FAILED — refusing to run any test.',
    '',
    'Both servers and the test runner must use the test database:',
    `  ${TEST_DATABASE_IDENTITY} (or localhost:5433/colina_test)`,
    '',
    ...problems.map((problem) => `- ${describeProblem(problem, errors)}`),
    '',
    'Start the test servers with:',
    '  scripts/e2e-servers.sh start',
    '',
    'Then export the test database for the runner and run the suite:',
    '  source ~/.colina/dburl.sh',
    '  npm run test:e2e',
    '',
    'No test body was executed.',
  ].join('\n');
}

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext();
  let web: HeaderResult;
  let admin: HeaderResult;

  try {
    [web, admin] = await Promise.all([
      readDatabaseHeader(api, WEB_CHECK_URL),
      readDatabaseHeader(api, ADMIN_CHECK_URL),
    ]);
  } finally {
    await api.dispose();
  }

  const problems = checkDatabaseSafety({
    runnerDatabaseUrl: process.env.DATABASE_URL,
    webHeader: web.value,
    adminHeader: admin.value,
  });

  if (problems.length > 0) {
    throw new Error(
      safetyFailureMessage(problems, { web: web.error, admin: admin.error })
    );
  }

  // Destructive, so it goes through the existing assertTestDatabase guard.
  // Reaching this line means the runner URL and both servers already proved
  // they are on the test database.
  resetRateLimitBuckets();
}
