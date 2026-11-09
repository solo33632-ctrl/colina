import { resolve } from 'node:path';
import { assertTestDatabase, runInDb, runInDbValue } from './db-fixture';

// Re-exported so the specs that gate on a database staying reachable keep
// importing it from where they always have.
export { DATABASE_URL } from './db-fixture';

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

export function ensureEditor() {
  // Absolute path for the same reason `@colina/db` gets one: the script runs
  // from the OS temp directory, where bare module names cannot resolve.
  const argon2Entry = require.resolve('argon2', {
    paths: [resolve(__dirname, '../packages/db')],
  });
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

/**
 * Stage 2b: revoke the editor's current JWTs by bumping the row's
 * `sessionVersion`. Returns the value before the bump so the caller can
 * restore it in a `finally` — the editor session is shared across specs,
 * and leaving the bump in place would silently invalidate their cached
 * storage state.
 *
 * Destructive (a write), so it is guarded like every other fixture.
 */
export function bumpEditorSessionVersion(): {
  previous: number;
  next: number;
} {
  assertTestDatabase();
  const result = runInDbValue<{ previous: number; next: number }>(`
    const before = await prisma.adminUser.findUnique({
      where: { id: ${JSON.stringify(EDITOR.id)} },
      select: { sessionVersion: true },
    });
    if (!before) {
      throw new Error('editor fixture is missing');
    }
    const after = await prisma.adminUser.update({
      where: { id: ${JSON.stringify(EDITOR.id)} },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    return { previous: before.sessionVersion, next: after.sessionVersion };
  `);
  if (!result) {
    throw new Error('bumpEditorSessionVersion: no result');
  }
  return result;
}

/** Restores the exact version a test found, keeping shared sessions valid. */
export function restoreEditorSessionVersion(version: number) {
  assertTestDatabase();
  runInDb(`
    await prisma.adminUser.update({
      where: { id: ${JSON.stringify(EDITOR.id)} },
      data: { sessionVersion: ${JSON.stringify(version)} },
    });
  `);
}
