import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Direct database fixtures for the public-site specs.
//
// These specs need rows the public site can be pointed at — a category with a
// photo, a machine with a photo, an empty category — and driving the admin UI
// to make them would couple a *public* test to an admin login, an admin server
// and a set of translated form labels. Writing the rows directly is faster and
// states exactly what the assertion needs.
//
// Every fixture this module creates is named with `FIXTURE_TAG` and removed by
// `cleanupFixtures`, so a run leaves the database as it found it. Nothing here
// reads or writes anything outside the database named by DATABASE_URL, and the
// suite is expected to be run with that pointing at a test database.

export const DATABASE_URL = process.env.DATABASE_URL;

// The web app serves three real photographs, and the showcase fixtures point at
// two of them. Same-origin on purpose: apps/web sends
// `Content-Security-Policy: img-src 'self' data: https:` (see
// apps/web/next.config.mjs), so a fixture URL from the admin app's http://localhost:3001
// is refused by the browser and every photo-based assertion would fail on a
// blank tile. The admin app's icons do NOT work here, unlike in the 30a admin
// specs, where they are same-origin and therefore allowed by 'self'.
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

/** The before/after pair the showcase fixtures use: two real, different-size photos. */
export const SHOWCASE_PHOTOS = {
  before: `${WEB_URL}/logo.png`,
  after: `${WEB_URL}/icon.png`,
  /** Intrinsic widths, so a spec can tell a decoded photo from a broken one. */
  beforeWidth: 773,
  afterWidth: 512,
};

const DB_DIR = resolve(__dirname, '../packages/db');

/**
 * Refuses to touch anything that is not the test database.
 *
 * These helpers DELETE ROWS by design (fixture cleanup, the agents snapshot
 * and restore, the insights page-view reset). The suite is documented to run
 * against the throwaway database, but one mistaken shell export is enough to
 * point them at the development database and wipe real rows — so every write
 * route through this check before it runs: the URL must be the local test
 * instance — 127.0.0.1 or localhost, port 5433, database `colina_test`. A
 * missing DATABASE_URL throws too; without an explicit URL the child process
 * would inherit the app's development default instead.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set: refusing to run destructive fixtures without an explicit test database.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid URL: refusing to run destructive fixtures (${url}).`
    );
  }

  const host = parsed.hostname;
  const port = parsed.port;
  const database = parsed.pathname.replace(/^\/+/, '');
  const isTest =
    (host === '127.0.0.1' || host === 'localhost') &&
    port === '5433' &&
    database === 'colina_test';
  if (!isTest) {
    throw new Error(
      `DATABASE_URL ${host}:${port}/${database} is not the test database: destructive fixtures only run against 127.0.0.1:5433/colina_test.`
    );
  }
}

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
export function runInDb(body: string) {
  assertTestDatabase();
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

/**
 * Every row these specs create carries this in its slug, and cleanup deletes by
 * it. A prefix rather than a fixed slug means two concurrent runs cannot
 * collide, and a leftover row from a crashed run is identifiable by eye.
 */
export const FIXTURE_TAG = 'st28a';

/**
 * A photo of a given intrinsic size, as an inline SVG data URI.
 *
 * Data URI rather than a real upload, and a real intrinsic size rather than one
 * shape, for the same reason: the hero specs assert that the photo is rendered
 * COMPLETE, and the only honest way to do that is with images whose proportions
 * cannot be confused with the frame's. A 400x900 portrait, a 1600x500 panorama
 * and a 600x600 square all letterbox in the same box, and each of them would
 * have lost a different edge to `cover`.
 *
 * Because the bytes are in the spec the image always loads, so an assertion
 * never has to be skipped for an offline run.
 *
 * `width`/`height` are set so the browser reports a real `naturalWidth` /
 * `naturalHeight`, which is what the uncropped proof is computed from.
 */
export function photoOf(width: number, height: number) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    ` viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#EB693F"/>`,
    `<circle cx="${Math.round(width / 3)}" cy="${Math.round(height / 2)}" r="${Math.round(Math.min(width, height) / 4)}" fill="#FFF0E2"/>`,
    `<rect x="${Math.round(width * 0.7)}" y="${Math.round(height * 0.2)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 0.6)}" fill="#6E1711"/>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * A 4:1 photo, as an inline SVG data URI.
 *
 * Data URI rather than a real upload, and 4:1 rather than something square, for
 * the same reason: the card specs assert that a photo is rendered COMPLETE, and
 * the only honest way to do that is with an image whose proportions cannot be
 * confused with the frame's. At 4:1 inside a 4:3 box, `object-fit: cover`
 * would crop away two thirds of the picture and `contain` must letterbox it
 * instead — and because the bytes are in the spec, the image always loads, so
 * the assertion never has to be skipped for an offline run.
 *
 * `width`/`height` are set so the browser reports a real `naturalWidth` /
 * `naturalHeight`, which is what the uncropped proof is computed from.
 */
export function widePhoto() {
  return photoOf(800, 200);
}

export type CategoryFixture = {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  image?: string;
};

/** Creates a category, optionally with a photo and a description. */
export function createCategory(fixture: CategoryFixture) {
  runInDb(`
    await prisma.machineCategory.create({
      data: {
        slug: ${JSON.stringify(fixture.slug)},
        nameEn: ${JSON.stringify(fixture.nameEn)},
        nameAr: ${JSON.stringify(fixture.nameAr)},
        descriptionEn: ${JSON.stringify(fixture.descriptionEn ?? '')},
        descriptionAr: ${JSON.stringify(fixture.descriptionAr ?? '')},
        image: ${JSON.stringify(fixture.image ?? null)},
      },
    });
  `);
}

export type MaintenanceCategoryFixture = {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  imageUrl?: string;
  sortOrder?: number;
};

/** Creates a maintenance category (one production line). */
export function createMaintenanceCategory(fixture: MaintenanceCategoryFixture) {
  runInDb(`
    await prisma.maintenanceCategory.create({
      data: {
        slug: ${JSON.stringify(fixture.slug)},
        nameEn: ${JSON.stringify(fixture.nameEn)},
        nameAr: ${JSON.stringify(fixture.nameAr)},
        descriptionEn: ${JSON.stringify(fixture.descriptionEn ?? null)},
        descriptionAr: ${JSON.stringify(fixture.descriptionAr ?? null)},
        imageUrl: ${JSON.stringify(fixture.imageUrl ?? null)},
        sortOrder: ${JSON.stringify(fixture.sortOrder ?? 0)},
      },
    });
  `);
}

export type MachineFixture = {
  slug: string;
  nameEn: string;
  nameAr: string;
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  categorySlug: string;
  imageUrl?: string;
  /**
   * Several photos, in display order. Takes precedence over `imageUrl`, which
   * stays for the single-photo case the card specs use.
   */
  images?: { url: string; position: number }[];
};

/** Creates a machine in an existing category, optionally with photos. */
export function createMachine(fixture: MachineFixture) {
  const rows =
    fixture.images ??
    (fixture.imageUrl ? [{ url: fixture.imageUrl, position: 0 }] : []);

  runInDb(`
    const category = await prisma.machineCategory.findUniqueOrThrow({
      where: { slug: ${JSON.stringify(fixture.categorySlug)} },
    });
    await prisma.machine.create({
      data: {
        slug: ${JSON.stringify(fixture.slug)},
        nameEn: ${JSON.stringify(fixture.nameEn)},
        nameAr: ${JSON.stringify(fixture.nameAr)},
        shortDescriptionEn: ${JSON.stringify(fixture.shortDescriptionEn)},
        shortDescriptionAr: ${JSON.stringify(fixture.shortDescriptionAr)},
        descriptionEn: '',
        descriptionAr: '',
        specsEn: '',
        specsAr: '',
        categoryId: category.id,
        images: {
          create: ${JSON.stringify(rows)},
        },
      },
    });
  `);
}

/**
 * Like `runInDb`, but hands back the value the body `return`s.
 *
 * `runInDb` discards stdout, which is right for a fixture that only writes. A
 * spec that has to ASK the database something — "how many rows are left that
 * are not mine?" — needs the answer back, so the body is wrapped to print it
 * as JSON and the child's stdout is parsed.
 */
export function runInDbValue<T>(body: string): T | null {
  assertTestDatabase();
  const dir = mkdtempSync(join(tmpdir(), 'colina-e2e-'));
  const file = join(dir, 'query.ts');
  const entry = require.resolve('@colina/db', { paths: [DB_DIR] });
  writeFileSync(
    file,
    [
      `const { prisma } = require(${JSON.stringify(entry)});`,
      '(async () => {',
      'const __value = await (async () => {',
      body,
      '})();',
      'await prisma.$disconnect();',
      'console.log("__RESULT__" + JSON.stringify(__value ?? null));',
      '})().catch((e) => { console.error(e); process.exit(1); });',
      '',
    ].join('\n')
  );

  try {
    const stdout = execFileSync('npx', ['tsx', file], {
      cwd: DB_DIR,
      env: { ...process.env, DATABASE_URL },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const line = stdout
      .split('\n')
      .find((value) => value.startsWith('__RESULT__'));
    return line ? (JSON.parse(line.slice('__RESULT__'.length)) as T) : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Creates a maintenance showcase row: one comparison, one before/after pair.
 *
 * The photos are two real PNGs the WEB app serves (see SHOWCASE_PHOTOS), not
 * `photoOf()` data URIs. The admin form's URL rule only ever applies to what an
 * admin types, so a data URI would be accepted here — but the public section
 * has to render two actual images for a test to prove anything about the
 * slider, and these are genuine responses the page is allowed to load.
 */
export type ShowcaseFixture = {
  nameEn: string;
  nameAr: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  /** The production line the machine belongs to. Omit for an orphan row. */
  categorySlug?: string;
  descriptionEn?: string;
  descriptionAr?: string;
};

/**
 * Creates a maintenance showcase row and returns its generated id.
 *
 * The id is what a detail-page URL is made of, so a spec that wants to visit
 * one machine has to know it; cuid is not predictable. The optional
 * `categorySlug` is resolved in the same child process, which keeps the
 * fixture's caller from having to query the category first.
 */
export function createShowcase(fixture: ShowcaseFixture): string {
  const before = fixture.beforeImageUrl ?? SHOWCASE_PHOTOS.before;
  const after = fixture.afterImageUrl ?? SHOWCASE_PHOTOS.after;
  const categoryLookup = fixture.categorySlug
    ? `const category = await prisma.maintenanceCategory.findUniqueOrThrow({
        where: { slug: ${JSON.stringify(fixture.categorySlug)} },
        select: { id: true },
      });`
    : 'const category = null;';
  const id = runInDbValue<string>(`
    ${categoryLookup}
    const row = await prisma.maintenanceShowcase.create({
      data: {
        nameEn: ${JSON.stringify(fixture.nameEn)},
        nameAr: ${JSON.stringify(fixture.nameAr)},
        descriptionEn: ${JSON.stringify(fixture.descriptionEn ?? null)},
        descriptionAr: ${JSON.stringify(fixture.descriptionAr ?? null)},
        beforeImageUrl: ${JSON.stringify(before)},
        afterImageUrl: ${JSON.stringify(after)},
        categoryId: category ? category.id : null,
      },
      select: { id: true },
    });
    return row.id;
  `);
  if (!id) {
    throw new Error(`createShowcase: no id returned for ${fixture.nameEn}`);
  }
  return id;
}

/**
 * Removes showcase rows a spec created, matched by the same tag.
 *
 * Kept separate from `cleanupFixtures` because the admin specs drive these
 * rows through the real form and their own delete dialog: if an assertion
 * fails partway, the row is still sitting there and the next run would meet
 * it. Deleting by name rather than by slug because this entity has no slug —
 * it is identified by its cuid, which a spec that created the row through the
 * UI cannot predict.
 */
export function deleteShowcasesByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.maintenanceShowcase.deleteMany({
        where: {
          OR: [
            { nameEn: { contains: ${JSON.stringify(tag)} } },
            { nameAr: { contains: ${JSON.stringify(tag)} } },
          ],
        },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

/**
 * Removes maintenance categories a spec created, matched by the same tag.
 *
 * Its showcase items must be gone first: MaintenanceShowcase.categoryId is
 * ON DELETE RESTRICT, so the category cannot go before them. Deleting by slug
 * because, unlike a showcase, this entity has one.
 */
export function deleteMaintenanceCategoriesByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.maintenanceShowcase.deleteMany({
        where: {
          OR: [
            { nameEn: { contains: ${JSON.stringify(tag)} } },
            { nameAr: { contains: ${JSON.stringify(tag)} } },
            { category: { slug: { contains: ${JSON.stringify(tag)} } } },
          ],
        },
      });
      await prisma.maintenanceCategory.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

export type SiteSettingsFixture = {
  whatsappNumber: string | null;
  whatsappMessageEn?: string | null;
  whatsappMessageAr?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  factoryAddressEn?: string | null;
  factoryAddressAr?: string | null;
  workingHoursEn?: string | null;
  workingHoursAr?: string | null;
  mapsUrl?: string | null;
};

/**
 * Creates or updates the singleton SiteSettings row used by the public site.
 *
 * `upsert` rather than create-or-update in the spec: the row is shared with
 * admin-settings.spec.ts (one worker, so the two never overlap), and a test
 * should be able to say "this is the state I need" without first checking
 * whether an earlier test left a row behind.
 */
export function setSiteSettings(fixture: SiteSettingsFixture) {
  runInDb(`
    const data = {
      whatsappNumber: ${JSON.stringify(fixture.whatsappNumber)},
      whatsappMessageEn: ${JSON.stringify(fixture.whatsappMessageEn ?? null)},
      whatsappMessageAr: ${JSON.stringify(fixture.whatsappMessageAr ?? null)},
      contactPhone: ${JSON.stringify(fixture.contactPhone ?? null)},
      contactEmail: ${JSON.stringify(fixture.contactEmail ?? null)},
      factoryAddressEn: ${JSON.stringify(fixture.factoryAddressEn ?? null)},
      factoryAddressAr: ${JSON.stringify(fixture.factoryAddressAr ?? null)},
      workingHoursEn: ${JSON.stringify(fixture.workingHoursEn ?? null)},
      workingHoursAr: ${JSON.stringify(fixture.workingHoursAr ?? null)},
      mapsUrl: ${JSON.stringify(fixture.mapsUrl ?? null)},
    };
    await prisma.siteSettings.upsert({
      where: { id: 'main' },
      create: { id: 'main', ...data },
      update: data,
    });
  `);
}

/**
 * Removes the singleton settings row, restoring the "no WhatsApp" state.
 *
 * Ignored on failure like the other cleanup helpers: a cleanup error must not
 * turn a passing assertion into a red run. The spec still asserts the row is
 * gone through the UI, so a silent failure cannot hide a leak.
 */
export function deleteSiteSettings() {
  try {
    runInDb(`
      await prisma.siteSettings.deleteMany({ where: { id: 'main' } });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

export type LeadStatusFixture = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';

export type ContactLeadFixture = {
  /**
   * Optional caller-chosen id. The audit rows for a status change name only
   * this id, so a spec that wants a tag-searchable audit entry passes an id
   * containing its fixture tag.
   */
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message: string;
  status?: LeadStatusFixture;
  /** ISO timestamp; omitted rows use the database's `now()`. */
  createdAt?: string;
};

export type MaintenanceLeadFixture = ContactLeadFixture & {
  company?: string | null;
  machineModel?: string | null;
};

/**
 * Creates contact-message leads in one child process and returns their ids.
 *
 * A batch rather than one call per row: the pagination spec needs enough leads
 * to cross the 20-row page size, and 25 `tsx` startups would dominate the run.
 * Names carry the caller's tag so `deleteLeadsByTag` can remove exactly this
 * run's rows.
 */
export function createContactLeads(rows: ContactLeadFixture[]): string[] {
  const ids = runInDbValue<string[]>(`
    const rows = ${JSON.stringify(rows)};
    const ids = [];
    for (const row of rows) {
      const created = await prisma.contactMessage.create({
        data: {
          ...(row.id ? { id: row.id } : {}),
          name: row.name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          message: row.message,
          status: row.status ?? 'NEW',
          ...(row.createdAt ? { createdAt: new Date(row.createdAt) } : {}),
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  `);
  if (!ids) {
    throw new Error('createContactLeads: no ids returned');
  }
  return ids;
}

/** Creates maintenance/quote requests in one child process, same as above. */
export function createMaintenanceLeads(
  rows: MaintenanceLeadFixture[]
): string[] {
  const ids = runInDbValue<string[]>(`
    const rows = ${JSON.stringify(rows)};
    const ids = [];
    for (const row of rows) {
      const created = await prisma.maintenanceRequest.create({
        data: {
          name: row.name,
          company: row.company ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          machineModel: row.machineModel ?? null,
          message: row.message,
          status: row.status ?? 'NEW',
          ...(row.createdAt ? { createdAt: new Date(row.createdAt) } : {}),
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  `);
  if (!ids) {
    throw new Error('createMaintenanceLeads: no ids returned');
  }
  return ids;
}

/** Removes the lead rows a spec created, matched by the same tag. */
export function deleteLeadsByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.contactMessage.deleteMany({
        where: { name: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.maintenanceRequest.deleteMany({
        where: { name: { contains: ${JSON.stringify(tag)} } },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

export type AgentFixture = {
  countryEn: string;
  countryAr: string;
  nameEn?: string | null;
  nameAr?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  isPublished?: boolean | null;
  cityEn?: string | null;
  cityAr?: string | null;
  addressEn?: string | null;
  addressAr?: string | null;
  phone?: string | null;
  email?: string | null;
};

/**
 * Creates Agent rows in one child process and returns their ids.
 *
 * The tag must be carried inside BOTH country names (Agent has no slug or any
 * other identifying column — it is grouped by country), so
 * `deleteAgentsByTag` can remove exactly this run's rows.
 */
export function createAgents(rows: AgentFixture[]): string[] {
  const ids = runInDbValue<string[]>(`
    const rows = ${JSON.stringify(rows)};
    const ids = [];
    for (const row of rows) {
      const created = await prisma.agent.create({
        data: {
          countryAr: row.countryAr,
          countryEn: row.countryEn,
          nameAr: row.nameAr ?? null,
          nameEn: row.nameEn ?? null,
          websiteUrl: row.websiteUrl ?? null,
          logoUrl: row.logoUrl ?? null,
          isPublished: row.isPublished ?? true,
          cityAr: row.cityAr ?? null,
          cityEn: row.cityEn ?? null,
          addressAr: row.addressAr ?? null,
          addressEn: row.addressEn ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  `);
  if (!ids) {
    throw new Error('createAgents: no ids returned');
  }
  return ids;
}

/** Removes the Agent rows a spec created, matched by the same tag. */
export function deleteAgentsByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.agent.deleteMany({
        where: {
          OR: [
            { countryEn: { contains: ${JSON.stringify(tag)} } },
            { countryAr: { contains: ${JSON.stringify(tag)} } },
          ],
        },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

export type PartnerFixture = {
  nameEn: string;
  nameAr: string;
  logo?: string | null;
};

/** Creates Partner rows in one child process and returns their ids. */
export function createPartners(rows: PartnerFixture[]): string[] {
  const ids = runInDbValue<string[]>(`
    const rows = ${JSON.stringify(rows)};
    const ids = [];
    for (const row of rows) {
      const created = await prisma.partner.create({
        data: {
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          logo: row.logo ?? null,
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  `);
  if (!ids) {
    throw new Error('createPartners: no ids returned');
  }
  return ids;
}

/** Removes the Partner rows a spec created, matched by the same tag. */
export function deletePartnersByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.partner.deleteMany({
        where: {
          OR: [
            { nameEn: { contains: ${JSON.stringify(tag)} } },
            { nameAr: { contains: ${JSON.stringify(tag)} } },
          ],
        },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

export type AuditLogFixture = {
  action: string;
  entity: string;
  createdAt?: string;
  /** Omit for a pre-Stage-38a row (no details column value). */
  details?: unknown;
  /** Resolved to `adminUserId`; omitted/unknown means a deleted admin. */
  adminEmail?: string | null;
};

/**
 * Creates AuditLog rows directly, for tests about the log page itself.
 *
 * The admin id is resolved by email inside the child process so a spec can
 * pass the same `ADMIN_EMAIL` it logs in with. Every row's entity or details
 * carries the caller's tag, which is what `auditLogsByTag` /
 * `deleteAuditLogsByTag` use — the table is append-only in the real app, but
 * these fixtures are deliberately removable.
 */
export function createAuditLogs(rows: AuditLogFixture[]): string[] {
  const ids = runInDbValue<string[]>(`
    const rows = ${JSON.stringify(rows)};
    const ids = [];
    for (const row of rows) {
      const admin = row.adminEmail
        ? await prisma.adminUser.findUnique({
            where: { email: row.adminEmail },
            select: { id: true },
          })
        : null;
      const created = await prisma.auditLog.create({
        data: {
          action: row.action,
          entity: row.entity,
          createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
          details: row.details === undefined ? null : row.details,
          adminUserId: admin ? admin.id : null,
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  `);
  if (!ids) {
    throw new Error('createAuditLogs: no ids returned');
  }
  return ids;
}

export type AuditLogFixtureRow = {
  id: string;
  action: string;
  entity: string;
  details: unknown;
};

/** Reads the audit rows carrying a tag, for stored-JSON assertions. */
export function auditLogsByTag(tag = FIXTURE_TAG): AuditLogFixtureRow[] {
  return (
    runInDbValue<AuditLogFixtureRow[]>(`
      // The tag can be in the entity (slugs/ids) OR only inside details — a
      // settings update names no entity identifier and has no label/search
      // text, so its changed values are the only place the tag can live.
      return prisma.$queryRawUnsafe(
        'SELECT id, action, entity, details FROM "AuditLog" WHERE entity LIKE $1 OR details::text LIKE $1 ORDER BY "createdAt" DESC',
        ${JSON.stringify(`%${tag}%`)}
      );
    `) ?? []
  );
}

/** Removes every audit row a spec created, including its details JSON. */
export function deleteAuditLogsByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.$executeRawUnsafe(
        'DELETE FROM "AuditLog" WHERE entity LIKE $1 OR details::text LIKE $1',
        ${JSON.stringify(`%${tag}%`)}
      );
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

/**
 * The whole Agent table, serialized.
 *
 * The empty-state test has to prove what the page shows when NO agent
 * exists, and the test database legitimately holds seeded agents
 * (seed-agent-cairo, seed-agent-riyadh) that must outlive the test. Nothing
 * relates to Agent, so delete-all + re-create is lossless — ids and
 * `createdAt` are put back, `updatedAt` is regenerated by Prisma.
 */
export type AgentRowSnapshot = {
  id: string;
  createdAt: string;
  countryAr: string;
  countryEn: string;
  nameAr: string | null;
  nameEn: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  isPublished: boolean;
  cityAr: string | null;
  cityEn: string | null;
  addressAr: string | null;
  addressEn: string | null;
  phone: string | null;
  email: string | null;
};

export function snapshotAllAgents(): AgentRowSnapshot[] {
  assertTestDatabase();
  return (
    runInDbValue<AgentRowSnapshot[]>(`
    return prisma.agent.findMany({ orderBy: { createdAt: 'asc' } });
  `) ?? []
  );
}

export function restoreAgents(rows: AgentRowSnapshot[]) {
  assertTestDatabase();
  runInDb(`
    const rows = ${JSON.stringify(rows)}.map((row) => ({
      id: row.id,
      countryAr: row.countryAr,
      countryEn: row.countryEn,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      websiteUrl: row.websiteUrl,
      logoUrl: row.logoUrl,
      isPublished: row.isPublished,
      cityAr: row.cityAr,
      cityEn: row.cityEn,
      addressAr: row.addressAr,
      addressEn: row.addressEn,
      phone: row.phone,
      email: row.email,
      createdAt: new Date(row.createdAt),
    }));
    await prisma.agent.deleteMany({});
    if (rows.length > 0) {
      await prisma.agent.createMany({ data: rows });
    }
  `);
}

/** Empties the Agent table (the empty-state test's short-lived state). */
export function deleteAllAgents() {
  assertTestDatabase();
  runInDb(`await prisma.agent.deleteMany({});`);
}

/**
 * Empties the page-view table so the insights spec ranks exactly the traffic
 * it seeds itself. Destructive, so it is guarded like every other wipe.
 */
export function resetPageViewDaily() {
  assertTestDatabase();
  runInDb(`await prisma.pageViewDaily.deleteMany({});`);
}

export type SecurityEventFixture = {
  type: 'RATE_LIMITED' | 'HONEYPOT_CAUGHT' | 'LOGIN_FAILED';
  /** The endpoint/form target stored in `SecurityEvent.source`. */
  source: string;
  ip?: string | null;
  detail?: string | null;
  /** ISO timestamp; omitted rows use the database's `now()`. */
  createdAt?: string;
};

/**
 * Creates security events directly, for the insights dashboard's exact
 * counts, type breakdown, top-target order and pagination.
 *
 * Every row must carry the fixture tag in source, ip or detail so
 * `deleteSecurityEventsByTag` can remove precisely this run's rows.
 */
export function createSecurityEvents(
  rows: SecurityEventFixture[],
  tag = FIXTURE_TAG
): string[] {
  for (const row of rows) {
    if (
      ![row.source, row.ip, row.detail].some((value) => value?.includes(tag))
    ) {
      throw new Error(
        `createSecurityEvents: a row for ${row.source} does not carry the "${tag}" tag`
      );
    }
  }

  const ids = runInDbValue<string[]>(`
    const rows = ${JSON.stringify(rows)};
    const ids = [];
    for (const row of rows) {
      const created = await prisma.securityEvent.create({
        data: {
          type: row.type,
          source: row.source,
          ip: row.ip ?? null,
          detail: row.detail ?? null,
          ...(row.createdAt ? { createdAt: new Date(row.createdAt) } : {}),
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  `);
  if (!ids) {
    throw new Error('createSecurityEvents: no ids returned');
  }
  return ids;
}

/** Removes the security rows a spec created, matched by the same tag. */
export function deleteSecurityEventsByTag(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      await prisma.securityEvent.deleteMany({
        where: {
          OR: [
            { source: { contains: ${JSON.stringify(tag)} } },
            { ip: { contains: ${JSON.stringify(tag)} } },
            { detail: { contains: ${JSON.stringify(tag)} } },
          ],
        },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}

/**
 * The whole SecurityEvent table, serialized.
 *
 * The all-clear test needs an empty window, but the test database legitimately
 * contains security rows written by earlier specs and manual runs. Snapshot,
 * clear, assert, then restore is the only way to test the zero state without
 * destroying that data or relying on a range that happens to be quiet.
 * Nothing references SecurityEvent, so ids and timestamps can be put back.
 */
export type SecurityEventRowSnapshot = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: SecurityEventFixture['type'];
  source: string;
  ip: string | null;
  detail: string | null;
};

export function snapshotAllSecurityEvents(): SecurityEventRowSnapshot[] {
  assertTestDatabase();
  return (
    runInDbValue<SecurityEventRowSnapshot[]>(`
      return prisma.securityEvent.findMany({ orderBy: { createdAt: 'asc' } });
    `) ?? []
  );
}

export function deleteAllSecurityEvents() {
  assertTestDatabase();
  runInDb(`await prisma.securityEvent.deleteMany({});`);
}

export function restoreSecurityEvents(rows: SecurityEventRowSnapshot[]) {
  assertTestDatabase();
  runInDb(`
    const rows = ${JSON.stringify(rows)}.map((row) => ({
      id: row.id,
      type: row.type,
      source: row.source,
      ip: row.ip,
      detail: row.detail,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
    await prisma.securityEvent.deleteMany({});
    if (rows.length > 0) {
      await prisma.securityEvent.createMany({ data: rows });
    }
  `);
}

/**
 * Removes every fixture these specs made. Safe to call twice and safe to call
 * when nothing was created — deleting a prefix that matches no rows is a
 * no-op, so cleanup never needs to know how far the run got.
 */
export function cleanupFixtures(tag = FIXTURE_TAG) {
  assertTestDatabase();
  try {
    runInDb(`
      // Children first: both relations are ON DELETE RESTRICT, so a parent
      // cannot go before its rows do. All use deleteMany, which is a no-op
      // when the prefix matches nothing — so cleanup never needs to know how
      // far a run got.
      await prisma.machine.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.machineCategory.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.maintenanceShowcase.deleteMany({
        where: {
          OR: [
            { nameEn: { contains: ${JSON.stringify(tag)} } },
            { nameAr: { contains: ${JSON.stringify(tag)} } },
          ],
        },
      });
      await prisma.maintenanceCategory.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}
