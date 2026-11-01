import { test, expect, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import {
  DATABASE_URL,
  EDITOR,
  ensureEditor,
  removeEditor,
} from './admin-editor';
import {
  createContactLeads,
  createMaintenanceLeads,
  deleteLeadsByTag,
  runInDb,
  runInDbValue,
} from './db-fixture';

// Deleting leaves from both surfaces the leads inbox renders.
//
// Fixtures are written straight to the database (same as the inbox spec):
// the subject is deletion + audit, not lead capture. Every name carries
// this run's STAMP (which is itself tagged with the suite-wide FIXTURE_TAG),
// cleanup deletes by that STAMP, and the audit rows are deleted by the
// fixture lead ids — the audit `entity` payload carries ids, not names, so
// no name-based cleanup could ever reach them.
const TAG = 'st28a';
const STAMP = `${TAG}-delete-${Date.now().toString(36)}`;

const SINGLE = {
  name: `${STAMP} Single`,
  email: 'st28a-del-single@example.com',
  phone: '+20 100 555 0001',
  message: 'Secret single fixture message with PII the audit must not copy.',
};
const BULK = [1, 2, 3].map((n) => ({
  name: `${STAMP} Bulk 0${n}`,
  email: `st28a-del-bulk-0${n}@example.com`,
  phone: `+20 100 555 000${n}`,
  message: `Secret bulk fixture ${n} message with PII the audit must not copy.`,
}));
const EDITOR_LEAD = {
  name: `${STAMP} Editor`,
  machineModel: 'Colina Conveyor Line',
  phone: '+20 100 555 0099',
  email: 'st28a-del-editor@example.com',
  message: 'Secret editor fixture message.',
};
const AR_LEAD = {
  name: `${STAMP} Arabic`,
  email: 'st28a-del-ar@example.com',
  phone: '+20 100 555 0088',
  message: 'رسالة عربية للطلب التجريبي.',
};
// Stays until the very last test and is the row whose survival proves the
// unauthenticated replay could not execute the delete action.
const UNAUTH_LEAD = {
  name: `${STAMP} Unauth`,
  email: 'st28a-del-unauth@example.com',
  phone: '+20 100 555 0066',
  message: 'Secret unauth fixture message.',
};

const SINGLE_SEARCH = `${STAMP} Single`;
const BULK_SEARCH = `${STAMP} Bulk`;
const EDITOR_SEARCH = `${STAMP} Editor`;
const AR_SEARCH = `${STAMP} Arabic`;
const UNAUTH_SEARCH = `${STAMP} Unauth`;

let singleId = '';
let bulkIds: string[] = [];
let editorId = '';
let arabicId = '';
let unauthId = '';
let allLeadIds: string[] = [];

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  adminUserId: string | null;
};

function auditsForLead(leadId: string): AuditRow[] {
  return (
    runInDbValue<AuditRow[]>(`
      return await prisma.auditLog.findMany({
        where: { entity: { contains: ${JSON.stringify(leadId)} } },
        orderBy: { createdAt: 'asc' },
      });
    `) ?? []
  );
}

function deleteAuditCount(leadId: string): number {
  return (
    runInDbValue<{ count: number }>(`
      return {
        count: await prisma.auditLog.count({
          where: {
            action: 'DELETE',
            entity: { contains: ${JSON.stringify(leadId)} },
          },
        }),
      };
    `)?.count ?? 0
  );
}

/** The delete-audit `entity` value only names ids, dates and counts. */
function expectAuditHoldsNoPii(entity: string, rows: typeof SINGLE) {
  expect(entity.startsWith('Lead ')).toBe(true);
  expect(entity).toMatch(/requested=\d+ deleted=\d+ skipped=\d+/);
  for (const secret of [rows.name, rows.email, rows.phone, rows.message]) {
    expect(entity, secret).not.toContain(secret);
  }
}

// The exact server-action wire call the logged-in UI makes, remembered by the
// first delete test and replayed without a session by the last one.
type CapturedAction = {
  url: string;
  id: string;
  contentType: string;
  body: string;
};

function rememberLeadAction(request: Request) {
  if (request.method() !== 'POST' || !request.url().includes('/leads')) {
    return;
  }
  const id = request.headers()['next-action'];
  if (!id) {
    return;
  }
  captured = {
    url: request.url(),
    id,
    contentType: request.headers()['content-type'] ?? 'text/plain;charset=UTF-8',
    body: request.postData() ?? '',
  };
}

let captured: CapturedAction | null = null;

function deleteLeadActionIdFromManifest(): string | null {
  for (const relative of [
    '../apps/admin/.next/dev/server/server-reference-manifest.json',
    '../apps/admin/.next/server/server-reference-manifest.json',
  ]) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(__dirname, relative), 'utf8')
      ) as {
        node?: Record<string, { filename?: string; exportedName?: string }>;
      };
      const match = Object.entries(manifest.node ?? {}).find(
        ([, value]) =>
          value.filename === 'apps/admin/lib/actions/leads.ts' &&
          value.exportedName === 'deleteLead'
      );
      if (match) {
        return match[0];
      }
    } catch {
      // No manifest (or no deleteLead in it): try the next location.
    }
  }
  return null;
}

test.describe('admin lead deletion', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
  test.skip(!DATABASE_URL, 'DATABASE_URL env is required');

  test.beforeAll(() => {
    if (!ADMIN_PASSWORD) {
      return;
    }
    singleId = createContactLeads([{ ...SINGLE, status: 'NEW' as const }])[0];
    bulkIds = createContactLeads(
      BULK.map((row) => ({
        ...row,
        status: 'NEW' as const,
      }))
    );
    editorId = createMaintenanceLeads([
      { ...EDITOR_LEAD, status: 'NEW' as const },
    ])[0];
    arabicId = createContactLeads([{ ...AR_LEAD, status: 'NEW' as const }])[0];
    unauthId = createContactLeads([
      { ...UNAUTH_LEAD, status: 'NEW' as const },
    ])[0];
    allLeadIds = [singleId, ...bulkIds, editorId, arabicId, unauthId];

    ensureEditor();
  });

  test.afterAll(() => {
    if (!ADMIN_PASSWORD) {
      return;
    }
    deleteLeadsByTag(STAMP);
    try {
      runInDb(`
        await prisma.auditLog.deleteMany({
          where: { OR: ${JSON.stringify(
            allLeadIds.map((id) => ({ entity: { contains: id } }))
          )} },
        });
      `);
    } catch {
      // Same rule as deleteLeadsByTag: cleanup never masks a test result.
    }
    if (DATABASE_URL) {
      removeEditor();
    }

    const leftovers = runInDbValue<{
      contacts: number;
      requests: number;
      audits: number;
    }>(`
      const contacts = await prisma.contactMessage.count({
        where: { name: { contains: ${JSON.stringify(STAMP)} } },
      });
      const requests = await prisma.maintenanceRequest.count({
        where: { name: { contains: ${JSON.stringify(STAMP)} } },
      });
      const audits = await prisma.auditLog.count({
        where: {
          OR: ${JSON.stringify(
            allLeadIds.map((id) => ({ entity: { contains: id } }))
          )},
        },
      });
      return { contacts, requests, audits };
    `);
    expect(leftovers).toEqual({
      contacts: 0,
      requests: 0,
      audits: 0,
    });
  });

  test('deleting one lead from the detail page (en)', async ({ browser }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    page.on('request', rememberLeadAction);

    await page.goto(`${ADMIN_URL}/en/leads/contact/${singleId}`);
    await expect(
      page.getByRole('heading', { name: SINGLE.name, level: 1 })
    ).toBeVisible();

    const trigger = page.getByRole('button', {
      name: `Delete request from ${SINGLE.name}`,
    });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      `Delete the request from “${SINGLE.name}”? This cannot be undone.`
    );
    // The dialog owns focus while it is open.
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('dialog') !== null
      )
    ).toBe(true);

    // Cancelling deletes nothing and returns focus to the trigger.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeVisible();
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? ''
      )
    ).toBe(`Delete request from ${SINGLE.name}`);
    expect(deleteAuditCount(singleId)).toBe(0);

    await trigger.click();
    await dialog.getByRole('button', { name: 'Delete request' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('deleted') === '1');
    await expect(page.getByText('Deleted requests: 1.')).toBeVisible();

    // It is gone from the list too.
    await page.goto(
      `${ADMIN_URL}/en/leads?q=${encodeURIComponent(SINGLE_SEARCH)}`
    );
    await expect(page.getByText('No results for your filters')).toBeVisible();

    // One DELETE audit entry, naming the id and received date and nothing
    // else from the request.
    const audits = auditsForLead(singleId);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('DELETE');
    expectAuditHoldsNoPii(audits[0].entity, SINGLE);
    expect(audits[0].entity).toContain(`contact:${singleId}`);
    expect(audits[0].entity).toMatch(
      new RegExp(`items=contact:${singleId}@[0-9T:.-]+Z,?$`)
    );

    expect(runInDbValue<{ count: number }>(`
      return {
        count: await prisma.contactMessage.count({
          where: { id: ${JSON.stringify(singleId)} },
        }),
      };
    `)?.count).toBe(0);

    await context.close();
  });

  test('bulk-deleting three leads, with a cancel first (en)', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    page.on('request', rememberLeadAction);

    await page.goto(`${ADMIN_URL}/en/leads?q=${encodeURIComponent(BULK_SEARCH)}`);
    const bodyRows = page.locator('main table tbody').getByRole('row');
    await expect(bodyRows).toHaveCount(3);

    const headerBox = page
      .locator('main table thead')
      .getByRole('checkbox', { name: 'Select all requests on this page' });
    const rowBoxes = page
      .locator('main table tbody')
      .getByRole('checkbox', { name: /^Select request from / });
    await expect(rowBoxes).toHaveCount(3);

    // Row checkboxes select one by one; the header checkbox then reflects
    // "all of this page" and reports the count in the bulk bar.
    for (const box of await rowBoxes.all()) {
      await box.click();
    }
    await expect(headerBox).toBeChecked();
    await expect(page.getByRole('status')).toHaveText('Selected: 3');
    await expect(
      page.getByRole('button', { name: 'Delete selected' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Clear selection' })
    ).toBeVisible();

    // The confirm names the count — and cancelling keeps all three rows.
    await page.getByRole('button', { name: 'Delete selected' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'Delete 3 selected requests? This cannot be undone.'
    );
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(bodyRows).toHaveCount(3);
    for (const id of bulkIds) {
      expect(deleteAuditCount(id)).toBe(0);
    }

    // Clearing the selection removes the bar without deleting anything.
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);

    await headerBox.click();
    await expect(page.getByRole('status')).toHaveText('Selected: 3');
    await page.getByRole('button', { name: 'Delete selected' }).click();
    await dialog.getByRole('button', { name: 'Delete selected' }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('deleted') === '3'
    );
    await expect(page.getByText('Deleted requests: 3.')).toBeVisible();

    // The filtered list emptied, the bar is gone, and the rows are really
    // deleted from the database.
    await expect(page.getByText('No results for your filters')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(
      runInDbValue<{ count: number }>(`
        return {
          count: await prisma.contactMessage.count({
            where: { id: { in: ${JSON.stringify(bulkIds)} } },
          }),
        };
      `)?.count
    ).toBe(0);

    // ONE audit entry for the whole bulk call: it names every id and no PII.
    const audit = auditsForLead(bulkIds[0]);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('DELETE');
    expect(audit[0].entity).toContain('requested=3 deleted=3 skipped=0');
    for (const [index, row] of BULK.entries()) {
      expect(audit[0].entity).toContain(`contact:${bulkIds[index]}`);
      expectAuditHoldsNoPii(audit[0].entity, row);
    }

    await context.close();
  });

  test('an EDITOR can delete a lead (en)', async ({ browser }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      EDITOR.email,
      EDITOR.password
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    page.on('request', rememberLeadAction);

    await page.goto(`${ADMIN_URL}/en/leads/maintenance/${editorId}`);
    await expect(
      page.getByRole('heading', { name: EDITOR_LEAD.name, level: 1 })
    ).toBeVisible();

    await page
      .getByRole('button', { name: `Delete request from ${EDITOR_LEAD.name}` })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete request' }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('deleted') === '1'
    );
    await expect(page.getByText('Deleted requests: 1.')).toBeVisible();

    await expect(
      runInDbValue<{ count: number }>(`
        return {
          count: await prisma.maintenanceRequest.count({
            where: { id: ${JSON.stringify(editorId)} },
          }),
        };
      `)?.count
    ).toBe(0);

    const audits = auditsForLead(editorId);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('DELETE');
    expect(audits[0].adminUserId).toBe(EDITOR.id);
    expectAuditHoldsNoPii(audits[0].entity, EDITOR_LEAD);
    expect(audits[0].entity).toContain(`maintenance:${editorId}`);

    await context.close();
  });

  test('deleting one lead in Arabic (ar)', async ({ browser }) => {
    const state = await loginState(
      browser,
      copyFor('ar'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    page.on('request', rememberLeadAction);

    await page.goto(`${ADMIN_URL}/ar/leads?q=${encodeURIComponent(AR_SEARCH)}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('main table tbody').getByRole('row')).toHaveCount(
      1
    );

    const headerBox = page
      .locator('main table thead')
      .getByRole('checkbox', { name: 'تحديد كل الطلبات في هذه الصفحة' });
    const rowBox = page
      .locator('main table tbody')
      .getByRole('checkbox', {
        name: `تحديد طلب من ${AR_LEAD.name}`,
      });
    await rowBox.click();
    await expect(headerBox).toBeChecked();
    await expect(page.getByRole('status')).toHaveText('المحدد: 1');

    await page.getByRole('button', { name: 'حذف المحدد' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'حذف 1 طلب محدد؟ لا يمكن التراجع عن هذا الإجراء.'
    );
    await dialog.getByRole('button', { name: 'إلغاء' }).click();
    await expect(dialog).toBeHidden();
    expect(deleteAuditCount(arabicId)).toBe(0);

    // The cancel left the page-wide checkbox counting the one selected row,
    // so clear it and select the row again for the real delete.
    await headerBox.click();
    await rowBox.click();
    await expect(page.getByRole('status')).toHaveText('المحدد: 1');
    await page.getByRole('button', { name: 'حذف المحدد' }).click();
    await dialog.getByRole('button', { name: 'حذف المحدد' }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('deleted') === '1'
    );
    await expect(page.getByText('الطلبات المحذوفة: 1.')).toBeVisible();
    await expect(page.locator('main table tbody').getByRole('row')).toHaveCount(
      0
    );

    const audits = auditsForLead(arabicId);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('DELETE');
    expectAuditHoldsNoPii(audits[0].entity, AR_LEAD);
    expect(audits[0].entity).toContain(`contact:${arabicId}`);

    await context.close();
  });

  test('the delete flow stays usable at 390px in both languages', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({
      storageState: state,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();

    function assertNoHorizontalOverflow() {
      return page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
    }

    await page.goto(`${ADMIN_URL}/en/leads?q=${encodeURIComponent(UNAUTH_SEARCH)}`);
    const cards = page
      .locator('main ul[aria-label="Leads"]')
      .getByRole('listitem');
    await expect(cards).toHaveCount(1);
    await expect(page.locator('main table')).toBeHidden();

    const cardBox = cards
      .getByRole('checkbox', { name: `Select request from ${UNAUTH_LEAD.name}` });
    await cardBox.click();
    await expect(page.getByRole('status')).toHaveText('Selected: 1');
    const enWidths = await assertNoHorizontalOverflow();
    expect(enWidths.document).toBeLessThanOrEqual(enWidths.viewport + 1);

    await page.getByRole('button', { name: 'Delete selected' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialogWidths = await assertNoHorizontalOverflow();
    expect(dialogWidths.document).toBeLessThanOrEqual(
      dialogWidths.viewport + 1
    );

    // Escape closes the bar's dialog and puts focus back on the button that
    // opened it ("Delete selected") — not on the row, which is still there.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(
      await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? ''
      )
    ).toBe('Delete selected');

    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);

    // The same shapes in Arabic, with RTL reasserted. The card list is
    // labelled with the Arabic heading.
    await page.goto(`${ADMIN_URL}/ar/leads?q=${encodeURIComponent(UNAUTH_SEARCH)}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const arabicCards = page
      .locator('main ul[aria-label="الطلبات"]')
      .getByRole('listitem');
    await expect(arabicCards).toHaveCount(1);
    await expect(
      page.locator('main ul[aria-label="الطلبات"]').getByRole('checkbox', {
        name: `تحديد طلب من ${UNAUTH_LEAD.name}`,
      })
    ).toBeVisible();

    await page
      .locator('main ul[aria-label="الطلبات"]')
      .getByRole('checkbox', { name: `تحديد طلب من ${UNAUTH_LEAD.name}` })
      .click();
    await expect(page.getByRole('status')).toHaveText('المحدد: 1');
    const arWidths = await assertNoHorizontalOverflow();
    expect(arWidths.document).toBeLessThanOrEqual(arWidths.viewport + 1);

    await page.getByRole('button', { name: 'حذف المحدد' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'حذف الطلب؟' })
    ).toBeVisible();
    const arDialogWidths = await assertNoHorizontalOverflow();
    expect(arDialogWidths.document).toBeLessThanOrEqual(
      arDialogWidths.viewport + 1
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: 'مسح التحديد' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);

    // Nothing was deleted from this run's fixture: the row survives.
    expect(
      runInDbValue<{ count: number }>(`
        return {
          count: await prisma.contactMessage.count({
            where: { id: ${JSON.stringify(unauthId)} },
          }),
        };
      `)?.count
    ).toBe(1);

    await context.close();
  });

  test('an unauthenticated direct call to the action is rejected', async ({
    browser,
  }) => {
    let payload: CapturedAction | null =
      captured ?? null;
    if (!payload) {
      const id = deleteLeadActionIdFromManifest();
      if (!id) {
        test.skip(true, 'no deleteLead action id available for replay');
        return;
      }
      payload = {
        url: `${ADMIN_URL}/en/leads`,
        id,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'contact', id: unauthId }),
      };
    }

    // A session-less browser context on the same origin.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en/login`);

    const response = await page.evaluate(
      async (request: CapturedAction) => {
        const reply = await fetch(request.url, {
          method: 'POST',
          headers: {
            'Next-Action': request.id,
            'Content-Type': request.contentType,
          },
          body: request.body,
          credentials: 'omit',
          signal: AbortSignal.timeout(20_000),
        });
        return {
          status: reply.status,
          url: reply.url,
          text: (await reply.text()).slice(0, 40_000),
        };
      },
      payload
    );

    // No session, no delete: the action must not have run (or must have
    // answered "unauthorized"), the row survives, and no audit entry exists.
    expect(response.text).not.toContain('"ok":true');
    const rejected =
      response.url.includes('/login') || response.text.includes('unauthorized');
    expect(rejected, JSON.stringify(response).slice(0, 500)).toBe(true);

    expect(
      runInDbValue<{ count: number }>(`
        return {
          count: await prisma.contactMessage.count({
            where: { id: ${JSON.stringify(unauthId)} },
          }),
        };
      `)?.count
    ).toBe(1);
    expect(deleteAuditCount(unauthId)).toBe(0);

    await context.close();
  });
});
