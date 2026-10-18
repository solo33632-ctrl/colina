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
export function runInDb(body: string) {
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
 * Removes every fixture these specs made. Safe to call twice and safe to call
 * when nothing was created — deleting a prefix that matches no rows is a
 * no-op, so cleanup never needs to know how far the run got.
 */
export function cleanupFixtures(tag = FIXTURE_TAG) {
  try {
    runInDb(`
      // Machines first: Machine.categoryId is ON DELETE RESTRICT, so a category
      // cannot go before its machines do. Both use deleteMany, which is a no-op
      // when the prefix matches nothing — so cleanup never needs to know how far
      // a run got.
      await prisma.machine.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
      await prisma.machineCategory.deleteMany({
        where: { slug: { contains: ${JSON.stringify(tag)} } },
      });
    `);
  } catch {
    // Intentionally ignored: cleanup must never mask a test result.
  }
}
