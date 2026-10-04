import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const DATABASE_URL = process.env.DATABASE_URL;

// A throwaway EDITOR account for the role-gate specs.
//
// The admin panel has no self-registration, so there is no UI path that could
// produce an editor — it is created straight in the database, which is also why
// these specs skip when DATABASE_URL is absent rather than failing.
//
// Lives here, not inside a spec, because two specs now gate on the role (the
// audit log and the insights dashboard) and the fixture should exist once.
export const EDITOR = {
  email: 'editor-e2e@example.com',
  password: 'editor-e2e-password-1234',
  id: 'e2e-editor',
};

const DB_DIR = resolve(__dirname, '../packages/db');

/**
 * Runs `body` against the database in a child process, with `prisma` in scope.
 *
 * `tsx -e` was the obvious way to do this and it proved flaky: the same bytes
 * on disk failed to transform while the same bytes inline did, reproducibly.
 * Writing the script to a file and running `tsx <file>` has no eval-mode
 * temporary file to go wrong, and it is a mechanism any Node developer can
 * reproduce by hand when a fixture needs debugging.
 *
 * The file goes to the OS temp directory rather than the repo, and is removed
 * whether or not the script succeeds.
 */
function runInDb(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'colina-e2e-'));
  const file = join(dir, 'fixture.ts');
  // Absolute entry path: a script in the temp directory must not depend on
  // module resolution walking up from there to the workspace's node_modules.
  const entry = require.resolve('@colina/db', { paths: [DB_DIR] });
  writeFileSync(
    file,
    [
      `const { prisma } = require(${JSON.stringify(entry)});`,
      '(async () => {',
      body,
      'await prisma.$disconnect();',
      '})().catch((e) => { console.error(e); process.exit(1); });',
      '',
    ].join('\n')
  );

  try {
    execFileSync('npx', ['tsx', file], {
      cwd: DB_DIR,
      env: { ...process.env, DATABASE_URL },
      stdio: 'pipe',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function ensureEditor() {
  // Absolute path for the same reason `@colina/db` gets one: the script runs
  // from the OS temp directory, where bare module names cannot resolve.
  const argon2Entry = require.resolve('argon2', { paths: [DB_DIR] });
  runInDb(`
    const argon2 = require(${JSON.stringify(argon2Entry)});
    const hash = await argon2.hash(${JSON.stringify(EDITOR.password)}, {
      type: argon2.argon2id,
    });
    await prisma.adminUser.upsert({
      where: { id: ${JSON.stringify(EDITOR.id)} },
      create: {
        id: ${JSON.stringify(EDITOR.id)},
        email: ${JSON.stringify(EDITOR.email)},
        passwordHash: hash,
        role: 'EDITOR',
      },
      update: { passwordHash: hash, role: 'EDITOR' },
    });
  `);
}

export function removeEditor() {
  // A missing editor is the desired end state, so a failure here is swallowed:
  // cleanup must never mask the test result that triggered it.
  try {
    runInDb(`
      await prisma.adminUser.deleteMany({
        where: { id: ${JSON.stringify(EDITOR.id)} },
      });
    `);
  } catch {
    // Intentionally ignored.
  }
}
