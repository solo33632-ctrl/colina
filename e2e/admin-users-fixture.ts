import { resolve } from 'node:path';
import { assertTestDatabase, runInDb, runInDbValue } from './db-fixture';

// Stage 4b fixtures: throwaway admin accounts plus the content and audit rows
// the deletion scenarios need. Everything is written straight to the test
// database (the panel has no UI that can hand rows to a different owner) and
// carries `st4b` in its email, slug or audit payload, so cleanup is exact.

export const ST4B_TAG = 'st4b';

export type StageUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'EDITOR' | 'SUPER_ADMIN';
};

// Created through the real users form, so it has no fixture id.
export const UI_EDITOR = {
  email: `${ST4B_TAG}-ui@example.com`,
  password: 'st4b-ui-editor-password-1234',
  newPassword: 'st4b-ui-editor-password-5678',
  name: 'UI Created Editor',
};

// Logs in only to prove an editor cannot reach the users area.
export const GATE_EDITOR: StageUser = {
  id: 'e2e-st4b-gate',
  email: `${ST4B_TAG}-gate@example.com`,
  password: 'st4b-gate-editor-password-1234',
  name: 'Gate Editor',
  role: 'EDITOR',
};

export const SCENARIO_A: StageUser = {
  id: 'e2e-st4b-a',
  email: `${ST4B_TAG}-a@example.com`,
  password: 'st4b-scenario-a-password-1234',
  name: 'Scenario A Editor',
  role: 'EDITOR',
};

export const SCENARIO_B: StageUser = {
  id: 'e2e-st4b-b',
  email: `${ST4B_TAG}-b@example.com`,
  password: 'st4b-scenario-b-password-1234',
  name: 'Scenario B Editor',
  role: 'EDITOR',
};

export const SCENARIO_C: StageUser = {
  id: 'e2e-st4b-c',
  email: `${ST4B_TAG}-c@example.com`,
  password: 'st4b-scenario-c-password-1234',
  name: 'Scenario C Editor',
  role: 'EDITOR',
};

// A second full admin: the wire test proves the action refuses it even though
// it is not the acting (or last) account.
export const SECOND_SUPER: StageUser = {
  id: 'e2e-st4b-super',
  email: `${ST4B_TAG}-super@example.com`,
  password: 'st4b-scenario-super-password-1234',
  name: 'Second Super Admin',
  role: 'SUPER_ADMIN',
};

export const FIXTURE_ACCOUNTS: StageUser[] = [
  GATE_EDITOR,
  SCENARIO_A,
  SCENARIO_B,
  SCENARIO_C,
  SECOND_SUPER,
];

export const FIXTURE_SLUGS = {
  aCategory: `${ST4B_TAG}-a-cat`,
  aMachine: `${ST4B_TAG}-a-machine`,
  bCategory: `${ST4B_TAG}-b-cat`,
  bMachine: `${ST4B_TAG}-b-machine`,
  cOwnCategory: `${ST4B_TAG}-c-own-cat`,
  cBlockedCategory: `${ST4B_TAG}-c-busy-cat`,
  cMachine: `${ST4B_TAG}-c-machine`,
  cAdminMachine: `${ST4B_TAG}-c-admin-machine`,
  uiCategory: `${ST4B_TAG}-ui-cat`,
  uiMachine: `${ST4B_TAG}-ui-machine`,
} as const;

export const FIXTURE_NAMES = {
  aCategory: 'E2E 4b A category',
  aMachine: 'E2E 4b A machine',
  bCategory: 'E2E 4b B category',
  bMachine: 'E2E 4b B machine',
  cOwnCategory: 'E2E 4b C own category',
  cBlockedCategory: 'E2E 4b C busy category',
  cMachine: 'E2E 4b C machine',
  cAdminMachine: 'E2E 4b C admin machine',
  uiCategory: 'E2E 4b UI category',
  uiMachine: 'E2E 4b UI machine',
} as const;

function hashEntry() {
  return require.resolve('argon2', {
    paths: [resolve(__dirname, '../packages/db')],
  });
}

export function ensureFixtureAccounts(
  accounts: StageUser[] = FIXTURE_ACCOUNTS
) {
  assertTestDatabase();
  runInDb(`
    const argon2 = require(${JSON.stringify(hashEntry())});
    for (const account of ${JSON.stringify(accounts)}) {
      const hash = await argon2.hash(account.password, {
        type: argon2.argon2id,
      });
      await prisma.adminUser.upsert({
        where: { id: account.id },
        create: {
          id: account.id,
          email: account.email,
          name: account.name,
          passwordHash: hash,
          role: account.role,
        },
        update: {
          email: account.email,
          name: account.name,
          passwordHash: hash,
          role: account.role,
          sessionVersion: 0,
        },
      });
    }
  `);
}

/**
 * Scenario content: every owner keeps a category plus a machine, and C's busy
 * category holds an admin-owned machine that must survive the content purge.
 */
export function seedScenarioContent(adminId: string) {
  assertTestDatabase();
  runInDb(`
    const category = async (slug, nameEn, createdById) =>
      prisma.machineCategory.upsert({
        where: { slug },
        create: {
          slug,
          nameEn,
          nameAr: 'فئة ' + nameEn,
          descriptionEn: 'Stage 4b fixture category.',
          descriptionAr: 'فئة اختبار للمرحلة 4ب.',
          createdById,
        },
        update: { nameEn, createdById },
        select: { id: true },
      });

    const machine = async (slug, nameEn, categoryId, createdById) =>
      prisma.machine.upsert({
        where: { slug },
        create: {
          slug,
          nameEn,
          nameAr: 'آلة ' + nameEn,
          shortDescriptionEn: 'Stage 4b fixture machine.',
          shortDescriptionAr: 'آلة اختبار للمرحلة 4ب.',
          descriptionEn: 'Stage 4b fixture machine description.',
          descriptionAr: 'وصف آلة اختبار المرحلة 4ب.',
          specsEn: 'Fixture specs.',
          specsAr: 'مواصفات الاختبار.',
          categoryId,
          createdById,
        },
        update: { nameEn, categoryId, createdById },
      });

    const aCat = await category(
      ${JSON.stringify(FIXTURE_SLUGS.aCategory)},
      ${JSON.stringify(FIXTURE_NAMES.aCategory)},
      ${JSON.stringify(SCENARIO_A.id)}
    );
    await machine(
      ${JSON.stringify(FIXTURE_SLUGS.aMachine)},
      ${JSON.stringify(FIXTURE_NAMES.aMachine)},
      aCat.id,
      ${JSON.stringify(SCENARIO_A.id)}
    );

    const bCat = await category(
      ${JSON.stringify(FIXTURE_SLUGS.bCategory)},
      ${JSON.stringify(FIXTURE_NAMES.bCategory)},
      ${JSON.stringify(SCENARIO_B.id)}
    );
    await machine(
      ${JSON.stringify(FIXTURE_SLUGS.bMachine)},
      ${JSON.stringify(FIXTURE_NAMES.bMachine)},
      bCat.id,
      ${JSON.stringify(SCENARIO_B.id)}
    );

    const cCat = await category(
      ${JSON.stringify(FIXTURE_SLUGS.cOwnCategory)},
      ${JSON.stringify(FIXTURE_NAMES.cOwnCategory)},
      ${JSON.stringify(SCENARIO_C.id)}
    );
    await machine(
      ${JSON.stringify(FIXTURE_SLUGS.cMachine)},
      ${JSON.stringify(FIXTURE_NAMES.cMachine)},
      cCat.id,
      ${JSON.stringify(SCENARIO_C.id)}
    );

    const cBusy = await category(
      ${JSON.stringify(FIXTURE_SLUGS.cBlockedCategory)},
      ${JSON.stringify(FIXTURE_NAMES.cBlockedCategory)},
      ${JSON.stringify(SCENARIO_C.id)}
    );
    await machine(
      ${JSON.stringify(FIXTURE_SLUGS.cAdminMachine)},
      ${JSON.stringify(FIXTURE_NAMES.cAdminMachine)},
      cBusy.id,
      ${JSON.stringify(adminId)}
    );

    // The audit rows the scenario accounts "wrote". Details carry only the
    // same safe label the real writers store, so the deleted-actor filter has
    // a readable sentence to show.
    const entry = (account, action, entity, label) => ({
      adminUserId: account.id,
      actorEmail: account.email,
      actorName: account.name,
      action,
      entity,
      details: {
        label: { en: label, ar: label },
        search: label.toLowerCase(),
        changes: [],
      },
    });

    await prisma.auditLog.deleteMany({
      where: { actorEmail: { contains: ${JSON.stringify(ST4B_TAG)} } },
    });
    await prisma.auditLog.createMany({
      data: [
        entry(
          ${JSON.stringify(SCENARIO_A)},
          'MACHINE_CREATE',
          ${JSON.stringify(`Machine:${FIXTURE_SLUGS.aMachine}`)},
          ${JSON.stringify(FIXTURE_NAMES.aMachine)}
        ),
        entry(
          ${JSON.stringify(SCENARIO_B)},
          'MACHINE_CREATE',
          ${JSON.stringify(`Machine:${FIXTURE_SLUGS.bMachine}`)},
          ${JSON.stringify(FIXTURE_NAMES.bMachine)}
        ),
        entry(
          ${JSON.stringify(SCENARIO_B)},
          'CATEGORY_CREATE',
          ${JSON.stringify(`MachineCategory:${FIXTURE_SLUGS.bCategory}`)},
          ${JSON.stringify(FIXTURE_NAMES.bCategory)}
        ),
        entry(
          ${JSON.stringify(SCENARIO_C)},
          'MACHINE_CREATE',
          ${JSON.stringify(`Machine:${FIXTURE_SLUGS.cMachine}`)},
          ${JSON.stringify(FIXTURE_NAMES.cMachine)}
        ),
        entry(
          ${JSON.stringify(SCENARIO_C)},
          'CATEGORY_CREATE',
          ${JSON.stringify(`MachineCategory:${FIXTURE_SLUGS.cOwnCategory}`)},
          ${JSON.stringify(FIXTURE_NAMES.cOwnCategory)}
        ),
      ],
    });
  `);
}

export function accountByEmail(email: string): {
  id: string;
  name: string | null;
  email: string;
  role: string;
} | null {
  return runInDbValue(`
    return prisma.adminUser.findUnique({
      where: { email: ${JSON.stringify(email)} },
      select: { id: true, name: true, email: true, role: true },
    });
  `);
}

export function auditCountForActor(email: string): number {
  return (
    runInDbValue<number>(`
      return prisma.auditLog.count({
        where: { actorEmail: ${JSON.stringify(email)} },
      });
    `) ?? 0
  );
}

export type ActorAuditRow = {
  action: string;
  entity: string;
  adminUserId: string | null;
  actorEmail: string | null;
};

/** Audit rows still attributed to a (possibly deleted) actor snapshot. */
export function actorAuditRows(email: string): ActorAuditRow[] {
  return (
    runInDbValue<ActorAuditRow[]>(`
      return prisma.auditLog.findMany({
        where: { actorEmail: ${JSON.stringify(email)} },
        select: {
          action: true,
          entity: true,
          adminUserId: true,
          actorEmail: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    `) ?? []
  );
}

export type UserDeleteAudit = {
  id: string;
  action: string;
  entity: string;
  actorEmail: string | null;
  adminUserId: string | null;
  details: unknown;
};

export function userDeleteAudit(targetId: string): UserDeleteAudit | null {
  return runInDbValue(`
    return prisma.auditLog.findFirst({
      where: {
        action: 'USER_DELETE',
        entity: ${JSON.stringify(`AdminUser:${targetId}`)},
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entity: true,
        actorEmail: true,
        adminUserId: true,
        details: true,
      },
    });
  `);
}

/** Removes every account, row and audit entry this spec can have created. */
export function cleanupUserFixtures(tag = ST4B_TAG) {
  try {
    assertTestDatabase();
    runInDb(`
      const accounts = await prisma.adminUser.findMany({
        where: { email: { contains: ${JSON.stringify(tag)} } },
        select: { id: true },
      });
      const accountEntities = accounts.map((row) => 'AdminUser:' + row.id);

      await prisma.machine.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.machineCategory.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorEmail: { contains: ${JSON.stringify(tag)} } },
            { entity: { contains: ${JSON.stringify(tag)} } },
            { entity: { in: accountEntities } },
            {
              details: {
                path: ['search'],
                string_contains: ${JSON.stringify(tag)},
              },
            },
          ],
        },
      });
      await prisma.adminUser.deleteMany({
        where: { email: { contains: ${JSON.stringify(tag)} } },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}
