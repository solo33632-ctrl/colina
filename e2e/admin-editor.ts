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

// Stage 4a's ownership spec needs a second editor: proving that editor A
// cannot touch editor B's rows requires two real accounts, and the existing
// fixture is shared with the role-gate specs.
export const EDITOR_B = {
  email: 'editor-b-e2e@example.com',
  password: 'editor-b-e2e-password-1234',
  id: 'e2e-editor-b',
};

type EditorAccount = typeof EDITOR;

function upsertEditor(account: EditorAccount) {
  // Absolute path for the same reason `@colina/db` gets one: the script runs
  // from the OS temp directory, where bare module names cannot resolve.
  const argon2Entry = require.resolve('argon2', {
    paths: [resolve(__dirname, '../packages/db')],
  });
  runInDb(`
    const argon2 = require(${JSON.stringify(argon2Entry)});
    const hash = await argon2.hash(${JSON.stringify(account.password)}, {
      type: argon2.argon2id,
    });
    await prisma.adminUser.upsert({
      where: { id: ${JSON.stringify(account.id)} },
      create: {
        id: ${JSON.stringify(account.id)},
        email: ${JSON.stringify(account.email)},
        passwordHash: hash,
        role: 'EDITOR',
      },
      update: { passwordHash: hash, role: 'EDITOR' },
    });
  `);
}

function removeEditorAccount(account: EditorAccount) {
  // A missing editor is the desired end state, so a failure here is swallowed:
  // cleanup must never mask the test result that triggered it.
  try {
    runInDb(`
      await prisma.adminUser.deleteMany({
        where: { id: ${JSON.stringify(account.id)} },
      });
    `);
  } catch {
    // Intentionally ignored.
  }
}

export function ensureEditor() {
  upsertEditor(EDITOR);
}

export function removeEditor() {
  removeEditorAccount(EDITOR);
}

export function ensureEditorB() {
  upsertEditor(EDITOR_B);
}

export function removeEditorB() {
  removeEditorAccount(EDITOR_B);
}

/**
 * Stage 4a fixture tag. Every row this spec creates carries it in its slug or
 * image URL, so cleanup can remove exactly this run's leftovers.
 */
export const EDITOR_FIXTURE_TAG = 'st4a';

/** Resolves the seeded super-admin's row id (used as a non-editor owner). */
export function adminUserId(email: string): string {
  const id = runInDbValue<string>(`
    const admin = await prisma.adminUser.findUniqueOrThrow({
      where: { email: ${JSON.stringify(email)} },
      select: { id: true },
    });
    return admin.id;
  `);
  if (!id) {
    throw new Error(`adminUserId: no admin row for ${email}`);
  }
  return id;
}

export type OwnedCategoryFixture = {
  slug: string;
  nameEn: string;
  nameAr: string;
  createdById: string | null;
  image?: string | null;
};

/** Creates a category with an explicit owner (`null` = pre-Stage-4a row). */
export function createOwnedCategory(fixture: OwnedCategoryFixture): string {
  const id = runInDbValue<string>(`
    const row = await prisma.machineCategory.create({
      data: {
        slug: ${JSON.stringify(fixture.slug)},
        nameEn: ${JSON.stringify(fixture.nameEn)},
        nameAr: ${JSON.stringify(fixture.nameAr)},
        descriptionEn: 'Fixture category.',
        descriptionAr: 'فئة اختبار.',
        image: ${JSON.stringify(fixture.image ?? null)},
        createdById: ${JSON.stringify(fixture.createdById)},
      },
      select: { id: true },
    });
    return row.id;
  `);
  if (!id) {
    throw new Error(`createOwnedCategory: no id returned for ${fixture.slug}`);
  }
  return id;
}

export type OwnedMachineFixture = {
  slug: string;
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  createdById: string | null;
  images?: { url: string; position: number }[];
  datasheetUrl?: string | null;
};

/** Creates a machine with an explicit owner, optionally with gallery rows. */
export function createOwnedMachine(fixture: OwnedMachineFixture): string {
  const id = runInDbValue<string>(`
    const category = await prisma.machineCategory.findUniqueOrThrow({
      where: { slug: ${JSON.stringify(fixture.categorySlug)} },
      select: { id: true },
    });
    const row = await prisma.machine.create({
      data: {
        slug: ${JSON.stringify(fixture.slug)},
        nameEn: ${JSON.stringify(fixture.nameEn)},
        nameAr: ${JSON.stringify(fixture.nameAr)},
        shortDescriptionEn: 'Fixture machine, short description.',
        shortDescriptionAr: 'آلة اختبار، وصف قصير.',
        descriptionEn: 'Fixture machine full description.',
        descriptionAr: 'وصف كامل لآلة الاختبار.',
        specsEn: 'Fixture specs.',
        specsAr: 'مواصفات الاختبار.',
        datasheetUrl: ${JSON.stringify(fixture.datasheetUrl ?? null)},
        categoryId: category.id,
        createdById: ${JSON.stringify(fixture.createdById)},
        images: {
          create: ${JSON.stringify(fixture.images ?? [])},
        },
      },
      select: { id: true },
    });
    return row.id;
  `);
  if (!id) {
    throw new Error(`createOwnedMachine: no id returned for ${fixture.slug}`);
  }
  return id;
}

/** Moves a fixture machine to another fixture category (delete-block setup). */
export function moveOwnedMachine(machineSlug: string, categorySlug: string) {
  runInDb(`
    const category = await prisma.machineCategory.findUniqueOrThrow({
      where: { slug: ${JSON.stringify(categorySlug)} },
      select: { id: true },
    });
    await prisma.machine.update({
      where: { slug: ${JSON.stringify(machineSlug)} },
      data: { categoryId: category.id },
    });
  `);
}

/** Replaces a fixture machine's gallery rows, for "created with an image". */
export function setOwnedMachineImages(slug: string, urls: string[]) {
  runInDb(`
    const machine = await prisma.machine.findUniqueOrThrow({
      where: { slug: ${JSON.stringify(slug)} },
      select: { id: true },
    });
    await prisma.machineImage.deleteMany({ where: { machineId: machine.id } });
    if (${JSON.stringify(urls)}.length > 0) {
      await prisma.machineImage.createMany({
        data: ${JSON.stringify(urls)}.map((url, position) => ({
          machineId: machine.id,
          url,
          position,
        })),
      });
    }
  `);
}

export type StoredMachine = {
  id: string;
  slug: string;
  nameEn: string;
  createdById: string | null;
  images: string[];
};

export type StoredCategory = {
  id: string;
  slug: string;
  nameEn: string;
  createdById: string | null;
  image: string | null;
};

export function storedMachine(slug: string): StoredMachine | null {
  return runInDbValue<StoredMachine | null>(`
    const row = await prisma.machine.findUnique({
      where: { slug: ${JSON.stringify(slug)} },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        createdById: true,
        images: { select: { url: true }, orderBy: { position: 'asc' } },
      },
    });
    return row ? { ...row, images: row.images.map((image) => image.url) } : null;
  `);
}

export function storedCategory(slug: string): StoredCategory | null {
  return runInDbValue<StoredCategory | null>(`
    return prisma.machineCategory.findUnique({
      where: { slug: ${JSON.stringify(slug)} },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        createdById: true,
        image: true,
      },
    });
  `);
}

export type AuditFixtureRow = {
  action: string;
  entity: string;
  adminUserId: string | null;
};

/**
 * Audit rows written for one or more exact `entity` values, oldest first.
 * Stage 4a asserts both halves of attribution: an editor's successful writes
 * carry its id, and a refused write leaves no row at all.
 */
export function auditRowsFor(entities: string[]): AuditFixtureRow[] {
  return (
    runInDbValue<AuditFixtureRow[]>(`
      return prisma.auditLog.findMany({
        where: { entity: { in: ${JSON.stringify(entities)} } },
        select: { action: true, entity: true, adminUserId: true },
        orderBy: { createdAt: 'asc' },
      });
    `) ?? []
  );
}

/**
 * Removes the machines then categories this spec created. MachineImage rows
 * cascade with their machine, and the order matters because the category FK
 * is Restrict.
 */
export function deleteEditorFixtures(tag = EDITOR_FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.machine.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.machineCategory.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      // Audit rows outlive their entity and their actor (the FK is SetNull),
      // so the stage tag in the entity text is what makes them cleanable.
      await prisma.auditLog.deleteMany({
        where: { entity: { contains: ${JSON.stringify(tag)} } },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
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
