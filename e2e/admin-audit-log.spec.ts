import { test, expect, type Browser, type Page } from '@playwright/test';
import type { StorageState } from '@playwright/test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import {
  auditLogsByTag,
  cleanupFixtures,
  createAuditLogs,
  createCategory,
  createContactLeads,
  createMachine,
  createMaintenanceCategory,
  createPartners,
  deleteAgentsByTag,
  deleteAuditLogsByTag,
  deleteLeadsByTag,
  deletePartnersByTag,
  deleteSiteSettings,
  setSiteSettings,
} from './db-fixture';

// Stage 38a: the audit log now records WHAT changed and the page shows it.
//
// The real writes are exercised through the admin UI (a partner rename, a
// machine description edit, an agent create/delete); the read-side cases
// (filters, pagination, pre-migration rows) seed AuditLog rows directly so
// they can control dates and volume without spending a dozen form submits.
//
// Every fixture carries `TAG` in its entity, slug, name or details.search.
// Cleanup removes exactly those rows, including the details JSON, so the
// run leaves the append-only log as it found it.
const TAG = 'st28a-audit';

// The login POST is rate-limited per IP, so this file spends ONE sign-in and
// shares it across tests (same pattern as admin-agents.spec.ts).
const SESSION_DIR = join(tmpdir(), `colina-admin-audit-${process.pid}`);
const SESSION_FILE = join(SESSION_DIR, 'state.json');
let sessionState: StorageState | null = null;

async function ensureSession(browser: Browser) {
  if (sessionState) {
    return sessionState;
  }
  if (existsSync(SESSION_FILE)) {
    sessionState = JSON.parse(
      readFileSync(SESSION_FILE, 'utf8')
    ) as StorageState;
    return sessionState;
  }
  sessionState = await loginState(
    browser,
    copyFor('en'),
    ADMIN_EMAIL,
    ADMIN_PASSWORD
  );
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(sessionState));
  return sessionState;
}

function fixtureDetails(
  labelEn: string,
  labelAr: string,
  changes: unknown[] = []
) {
  return {
    changes,
    label: { en: labelEn, ar: labelAr },
    search: `${labelEn} ${labelAr}`.toLowerCase(),
  };
}

async function signedInPage(browser: Browser) {
  const state = await ensureSession(browser);
  const context = await browser.newContext({
    storageState: state,
    viewport: { width: 1280, height: 900 },
  });
  return { context, page: await context.newPage() };
}

async function openEntryDetails(entry: ReturnType<Page['getByTestId']>) {
  await entry.locator('summary').click();
}

test.describe('admin audit log', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
  test.skip(
    !process.env.DATABASE_URL,
    'DATABASE_URL is required for audit fixtures'
  );

  test.beforeAll(async ({ browser }) => {
    await ensureSession(browser);
  });

  function resetFixtures() {
    deleteAuditLogsByTag(TAG);
    deletePartnersByTag(TAG);
    deleteAgentsByTag(TAG);
    deleteLeadsByTag(TAG);
    deleteSiteSettings();
    cleanupFixtures(TAG);
  }

  test.beforeEach(() => {
    resetFixtures();
  });

  test.afterAll(() => {
    resetFixtures();
    rmSync(SESSION_DIR, { recursive: true, force: true });
  });

  test('a partner rename shows Before/After for exactly the name field', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const oldName = `Partner ${TAG}`;
    const newName = `Renamed partner ${TAG}`;
    const logo = 'https://cdn.example.com/st28a-audit-logo.png';
    const [partnerId] = createPartners([
      { nameEn: oldName, nameAr: `شريك ${TAG}`, logo },
    ]);

    await page.goto(`${ADMIN_URL}/en/partners/${partnerId}/edit`);
    await expect(page.getByLabel('Name (English)')).toHaveValue(oldName);
    await page.getByLabel('Name (English)').fill(newName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/en\/partners\b/);

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=Partner&q=${encodeURIComponent(TAG)}`
    );
    const entry = page
      .getByTestId('audit-entry')
      .filter({ hasText: `Updated partner ${newName}` });
    await expect(entry).toHaveCount(1);

    // Row chrome: translated sentence, entity badge, admin email, and a
    // relative time whose full timestamp is also on the page.
    await expect(entry.getByText('Partner', { exact: true })).toBeVisible();
    await expect(entry).toContainText(ADMIN_EMAIL);
    const time = entry.locator('time');
    await expect(time).toBeVisible();
    const fullTime = await time.getAttribute('title');
    expect(fullTime).toBeTruthy();
    await expect(entry).toContainText(fullTime!);

    await openEntryDetails(entry);
    const table = entry.getByRole('table');
    await expect(table).toContainText('Before');
    await expect(table).toContainText('After');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    const row = table.locator('tbody tr').first();
    await expect(row).toContainText('Name (English)');
    await expect(row).toContainText(oldName);
    await expect(row).toContainText(newName);
    // The unchanged Arabic name and the unchanged logo never appear as
    // changes, and the logo URL is not snapshotted into the log.
    await expect(row).not.toContainText('Name (Arabic)');
    await expect(row).not.toContainText('Logo');
    const stored = JSON.stringify(auditLogsByTag(TAG));
    expect(stored).toContain(newName);
    expect(stored).not.toContain(logo);

    await context.close();
  });

  test('a machine description edit shows Before/After for exactly that field', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const categorySlug = `${TAG}-category`;
    const machineName = `Machine ${TAG}`;
    const machineSlug = `${TAG}-machine`;
    const description = `A detailed description written by the audit spec ${TAG}.`;
    createCategory({
      slug: categorySlug,
      nameEn: `Category ${TAG}`,
      nameAr: `فئة ${TAG}`,
    });
    createMachine({
      slug: machineSlug,
      nameEn: machineName,
      nameAr: `آلة ${TAG}`,
      shortDescriptionEn: 'Short description.',
      shortDescriptionAr: 'وصف قصير للآلة.',
      categorySlug,
    });

    await page.goto(
      `${ADMIN_URL}/en/machines?q=${encodeURIComponent(machineName)}`
    );
    await page
      .locator('tr', { hasText: machineName })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
    await expect(page.getByLabel('Full description (English)')).toHaveValue('');
    await page.getByLabel('Full description (English)').fill(description);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/en\/machines(\?|$)/);

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=Machine&q=${encodeURIComponent(TAG)}`
    );
    const entry = page
      .getByTestId('audit-entry')
      .filter({ hasText: `Updated machine ${machineName}` });
    await expect(entry).toHaveCount(1);

    await openEntryDetails(entry);
    const table = entry.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    const row = table.locator('tbody tr').first();
    await expect(row).toContainText('Description (English)');
    await expect(row).toContainText('—');
    await expect(row).toContainText(description);
    await expect(row).not.toContainText('Short description');
    await expect(entry).not.toContainText('آلة ');

    await context.close();
  });

  test('agent create and delete store identifying snapshots only', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const agentName = `Audit agent ${TAG}`;
    const agentNameAr = `وكيل ${TAG}`;
    const countryEn = `Agentland ${TAG}`;
    const countryAr = `دولة ${TAG}`;
    const agentEmail = `audit-agent-${TAG}@example.com`;
    const agentPhone = '+20 100 987 6543';
    const agentAddress = `${TAG} Industrial Road`;

    await page.goto(`${ADMIN_URL}/en/agents/new`);
    await page.getByLabel('Agent name (English)').fill(agentName);
    await page.getByLabel('Agent name (Arabic)').fill(agentNameAr);
    await page.getByLabel('Country (English)').fill(countryEn);
    await page.getByLabel('Country (Arabic)').fill(countryAr);
    await page.getByLabel('Address (English, optional)').fill(agentAddress);
    await page.getByLabel('Phone (optional)').fill(agentPhone);
    await page.getByLabel('Email (optional)').fill(agentEmail);
    await page.getByRole('button', { name: 'Create agent' }).click();
    await expect(page).toHaveURL(/\/en\/agents\b/);

    const listRow = page.locator('tr', { hasText: agentName });
    await expect(listRow).toHaveCount(1);
    await listRow.getByRole('button', { name: `Delete ${agentName}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`Delete “${agentName}”?`);
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('tr', { hasText: agentName })).toHaveCount(0);

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=Agent&q=${encodeURIComponent(TAG)}`
    );
    const entries = page.getByTestId('audit-entry');
    await expect(entries).toHaveCount(2);

    const created = entries.filter({ hasText: `Created agent ${agentName}` });
    const deleted = entries.filter({ hasText: `Deleted agent ${agentName}` });
    await expect(created).toHaveCount(1);
    await expect(deleted).toHaveCount(1);

    await openEntryDetails(created);
    const createdTable = created.getByRole('table');
    await expect(createdTable.locator('tbody tr')).toHaveCount(5);
    const createdName = createdTable
      .locator('tbody tr')
      .filter({ hasText: 'Name (English)' });
    await expect(createdName).toContainText('—');
    await expect(createdName).toContainText(agentName);
    await expect(createdTable).toContainText('Country (English)');
    await expect(createdTable).toContainText('Published');

    await openEntryDetails(deleted);
    const deletedTable = deleted.getByRole('table');
    await expect(deletedTable.locator('tbody tr')).toHaveCount(5);
    const deletedName = deletedTable
      .locator('tbody tr')
      .filter({ hasText: 'Name (English)' });
    await expect(deletedName).toContainText(agentName);
    await expect(deletedName).toContainText('—');

    // Contact details are not part of the snapshot; no credential vocabulary
    // can appear in the stored payload or in the rendered page.
    const stored = JSON.stringify(auditLogsByTag(TAG));
    const rendered = await page.locator('body').innerText();
    for (const forbidden of [
      agentEmail,
      agentPhone,
      agentAddress,
      ADMIN_PASSWORD,
      'passwordHash',
    ]) {
      expect(stored).not.toContain(forbidden);
      expect(rendered).not.toContain(forbidden);
    }
    expect(stored).toContain(agentName);

    await context.close();
  });

  test('a site-settings save shows exactly the changed contact fields', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const oldNumber = '201001234567';
    const newNumber = '201009876543';
    const oldEmail = `old-${TAG}@example.com`;
    const newEmail = `audit-${TAG}@example.com`;

    setSiteSettings({
      whatsappNumber: oldNumber,
      whatsappMessageEn: `Greeting ${TAG}`,
      whatsappMessageAr: `تحية ${TAG}`,
      contactPhone: '+20 100 123 4567',
      contactEmail: oldEmail,
      factoryAddressEn: `Old factory address ${TAG}`,
      workingHoursEn: '9-5',
      mapsUrl: 'https://maps.example.com/old',
    });

    await page.goto(`${ADMIN_URL}/en/settings`);
    // Wait for the client form to hydrate before typing: filling the
    // server-rendered value first can land before react-hook-form attaches,
    // and the hydrated default then gets concatenated with the typed text.
    const numberInput = page.locator('#settings-whatsapp-number');
    await expect(numberInput).toHaveValue(oldNumber);
    await numberInput.fill('');
    await numberInput.fill(`+${newNumber}`);
    const emailInput = page.locator('#settings-contact-email');
    await expect(emailInput).toHaveValue(oldEmail);
    await emailInput.fill('');
    await emailInput.fill(newEmail);
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved successfully.')).toBeVisible();

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=SiteSettings&action=SETTINGS_UPDATE`
    );
    // Older settings saves leave untagged entries behind (the settings
    // action has no label or entity identifier), so scope to the newest:
    // this save is always the most recent SETTINGS_UPDATE row.
    const entry = page
      .getByTestId('audit-entry')
      .filter({ hasText: 'Updated site settings' })
      .first();
    await expect(entry).toBeVisible();
    await expect(
      entry.getByText('Site settings', { exact: true })
    ).toBeVisible();

    await openEntryDetails(entry);
    const table = entry.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    const numberRow = table
      .locator('tbody tr')
      .filter({ hasText: 'WhatsApp number' });
    await expect(numberRow).toContainText(oldNumber);
    await expect(numberRow).toContainText(newNumber);
    const emailRow = table
      .locator('tbody tr')
      .filter({ hasText: 'Contact email' });
    await expect(emailRow).toContainText(oldEmail);
    await expect(emailRow).toContainText(newEmail);

    // Exactly the two fields the save changed: no unchanged business field
    // and no secret-looking field is part of the payload or the page.
    await expect(table).not.toContainText('WhatsApp greeting');
    await expect(table).not.toContainText('Factory address');
    const stored = JSON.stringify(
      auditLogsByTag(TAG).filter((row) => row.action === 'SETTINGS_UPDATE')
    );
    expect(stored).toContain(oldNumber);
    expect(stored).toContain(newNumber);
    expect(stored).toContain(newEmail);
    const rendered = await page.locator('body').innerText();
    for (const forbidden of [
      ADMIN_PASSWORD,
      'passwordHash',
      'passwordResetTokenHash',
      'sessionToken',
      'apiKey',
    ]) {
      expect(stored).not.toContain(forbidden);
      expect(rendered).not.toContain(forbidden);
    }

    await context.close();
  });

  test('a maintenance category rename shows Before/After for exactly the name field', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const oldName = `Old line ${TAG}`;
    const newName = `Renamed line ${TAG}`;
    const description = `Description that must not enter the audit ${TAG}.`;
    createMaintenanceCategory({
      slug: `${TAG}-line`,
      nameEn: oldName,
      nameAr: `خط ${TAG}`,
      descriptionEn: description,
      sortOrder: 1,
    });

    await page.goto(`${ADMIN_URL}/en/maintenance-categories`);
    const listRow = page.locator('tr', { hasText: oldName });
    await expect(listRow).toHaveCount(1);
    await listRow.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/maintenance-categories\/[^/]+\/edit$/);
    await expect(page.getByLabel('Name')).toHaveValue(oldName);
    await page.getByLabel('Name').fill(newName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-categories`);

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=MaintenanceCategory&q=${encodeURIComponent(TAG)}`
    );
    const entry = page
      .getByTestId('audit-entry')
      .filter({ hasText: `Updated maintenance category ${newName}` });
    await expect(entry).toHaveCount(1);
    await expect(
      entry.getByText('Maintenance category', { exact: true })
    ).toBeVisible();

    await openEntryDetails(entry);
    const table = entry.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    const row = table.locator('tbody tr').first();
    await expect(row).toContainText('Name (English)');
    await expect(row).toContainText(oldName);
    await expect(row).toContainText(newName);
    await expect(row).not.toContainText('Name (Arabic)');

    const stored = JSON.stringify(
      auditLogsByTag(TAG).filter(
        (audit) => audit.action === 'MAINTENANCE_CATEGORY_UPDATE'
      )
    );
    expect(stored).toContain(newName);
    expect(stored).not.toContain(description);

    await context.close();
  });

  test('a lead status change records only the status diff, never the visitor data', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const leadId = `${TAG}-lead-status`;
    const lead = {
      id: leadId,
      name: `Status lead ${TAG}`,
      email: `status-${TAG}@example.com`,
      phone: '+20 100 111 2222',
      message: 'Private status message that must never enter the audit.',
      status: 'NEW' as const,
    };
    createContactLeads([lead]);

    await page.goto(`${ADMIN_URL}/en/leads/contact/${leadId}`);
    // `getByLabel('Status')` also matches the delete button's accessible
    // name ("Delete request from Status lead …"); the select has a stable id.
    await page.locator('#lead-status').selectOption('RESOLVED');
    await page.getByRole('button', { name: 'Update status' }).click();
    await expect(
      page.locator('header').getByText('Resolved', { exact: true })
    ).toBeVisible();

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=ContactMessage&q=${encodeURIComponent(TAG)}`
    );
    const entry = page
      .getByTestId('audit-entry')
      .filter({ hasText: 'Changed lead status' });
    await expect(entry).toHaveCount(1);
    await expect(
      entry.getByText('Contact message', { exact: true })
    ).toBeVisible();

    await openEntryDetails(entry);
    const table = entry.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    const row = table.locator('tbody tr').first();
    await expect(row).toContainText('Status');
    await expect(row).toContainText('NEW');
    await expect(row).toContainText('RESOLVED');

    const audits = auditLogsByTag(TAG).filter(
      (audit) => audit.action === 'LEAD_STATUS_UPDATE'
    );
    expect(audits).toHaveLength(1);
    const stored = JSON.stringify(audits);
    expect(stored).toContain('"field":"status"');
    expect(stored).toContain('"from":"NEW"');
    expect(stored).toContain('"to":"RESOLVED"');
    expect(stored).toContain(leadId);

    const rendered = await page.locator('body').innerText();
    for (const secret of [lead.name, lead.email, lead.phone, lead.message]) {
      expect(stored).not.toContain(secret);
      expect(rendered).not.toContain(secret);
    }

    await context.close();
  });

  test('a lead delete shows counts only and no personal data', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    const leadId = `${TAG}-lead-delete`;
    const lead = {
      id: leadId,
      name: `Delete lead ${TAG}`,
      email: `delete-${TAG}@example.com`,
      phone: '+20 100 333 4444',
      message: 'Private delete message that must never enter the audit.',
      status: 'NEW' as const,
    };
    createContactLeads([lead]);

    await page.goto(`${ADMIN_URL}/en/leads/contact/${leadId}`);
    await page
      .getByRole('button', { name: `Delete request from ${lead.name}` })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      `Delete the request from “${lead.name}”?`
    );
    await dialog.getByRole('button', { name: 'Delete request' }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('deleted') === '1'
    );

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=Lead&action=DELETE&q=${encodeURIComponent(TAG)}`
    );
    const entry = page
      .getByTestId('audit-entry')
      .filter({ hasText: 'Deleted leads' });
    await expect(entry).toHaveCount(1);
    await expect(entry.getByText('Leads', { exact: true })).toBeVisible();

    await openEntryDetails(entry);
    const table = entry.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    const requested = table
      .locator('tbody tr')
      .filter({ hasText: 'Requested' });
    await expect(requested).toContainText('1');
    const deleted = table.locator('tbody tr').filter({ hasText: 'Deleted' });
    await expect(deleted).toContainText('1');
    const skipped = table.locator('tbody tr').filter({ hasText: 'Skipped' });
    await expect(skipped).toContainText('0');

    const audits = auditLogsByTag(TAG).filter(
      (audit) => audit.action === 'DELETE'
    );
    expect(audits).toHaveLength(1);
    const stored = JSON.stringify(audits);
    expect(stored).toContain(leadId);
    expect(stored).toContain('"requested"');
    expect(stored).toContain('"deleted"');
    expect(stored).toContain('"skipped"');

    const rendered = await page.locator('body').innerText();
    for (const secret of [lead.name, lead.email, lead.phone, lead.message]) {
      expect(stored).not.toContain(secret);
      expect(rendered).not.toContain(secret);
    }

    await context.close();
  });

  test('search, entity, action, admin and date filters narrow the log', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    createAuditLogs([
      {
        action: 'PARTNER_UPDATE',
        entity: `Partner:${TAG}-filter-partner`,
        createdAt: '2026-10-05T10:00:00.000Z',
        adminEmail: ADMIN_EMAIL,
        details: fixtureDetails(`Partner ${TAG}`, `شريك ${TAG}`),
      },
      {
        action: 'MACHINE_UPDATE',
        entity: `Machine:${TAG}-filter-machine`,
        createdAt: '2026-10-20T10:00:00.000Z',
        adminEmail: ADMIN_EMAIL,
        details: fixtureDetails(`Machine ${TAG}`, `آلة ${TAG}`),
      },
      {
        action: 'AGENT_CREATE',
        entity: `Agent:${TAG}-filter-agent`,
        createdAt: '2026-11-02T10:00:00.000Z',
        adminEmail: ADMIN_EMAIL,
        details: fixtureDetails(`Agent ${TAG}`, `وكيل ${TAG}`),
      },
      {
        action: 'NEWS_UPDATE',
        entity: `NewsPost:${TAG}-filter-news`,
        createdAt: '2026-11-03T10:00:00.000Z',
        adminEmail: null,
        details: null,
      },
    ]);

    // Free text over the stored label.
    await page.goto(`${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(TAG)}`);
    await expect(page.getByTestId('audit-entry')).toHaveCount(4);

    // Arabic label search reaches the JSON `search` field, not just the raw
    // entity/action.
    await page.goto(
      `${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(`شريك ${TAG}`)}`
    );
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    await expect(
      page.getByTestId('audit-entry').filter({ hasText: `Partner ${TAG}` })
    ).toHaveCount(1);

    // Entity filter.
    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=Machine&q=${encodeURIComponent(TAG)}`
    );
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    await expect(
      page.getByTestId('audit-entry').filter({ hasText: `Machine ${TAG}` })
    ).toHaveCount(1);

    // Action filter, selected through the real form.
    await page.goto(`${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(TAG)}`);
    await page.getByLabel('Action').selectOption('AGENT_CREATE');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/action=AGENT_CREATE/);
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    await expect(
      page.getByTestId('audit-entry').filter({ hasText: `Agent ${TAG}` })
    ).toHaveCount(1);

    // Admin filter: the real account sees its three rows, the deleted-admin
    // sentinel sees the row whose admin is gone.
    await page.goto(`${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(TAG)}`);
    await page.getByLabel('Admin', { exact: true }).selectOption({
      label: ADMIN_EMAIL,
    });
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/admin=/);
    await expect(page.getByTestId('audit-entry')).toHaveCount(3);

    await page.getByLabel('Admin', { exact: true }).selectOption('deleted');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    await expect(
      page.getByTestId('audit-entry').filter({
        hasText: `NEWS_UPDATE NewsPost:${TAG}-filter-news`,
      })
    ).toHaveCount(1);

    // Inclusive date range: only the 5 October row.
    await page.goto(
      `${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(TAG)}&from=2026-10-01&to=2026-10-10`
    );
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    await expect(
      page.getByTestId('audit-entry').filter({ hasText: `Partner ${TAG}` })
    ).toHaveCount(1);

    await context.close();
  });

  test('pagination uses 25 rows per page and keeps the filters', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    createAuditLogs(
      Array.from({ length: 30 }, (_, index) => ({
        action: 'MACHINE_UPDATE',
        entity: `Machine:${TAG}-page-${index}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, index, 0)).toISOString(),
        adminEmail: ADMIN_EMAIL,
        details: fixtureDetails(
          `Paged machine ${TAG} ${index}`,
          `آلة صفحة ${TAG} ${index}`
        ),
      }))
    );

    await page.goto(
      `${ADMIN_URL}/en/audit-log?entity=Machine&q=${encodeURIComponent(TAG)}`
    );
    await expect(page.getByTestId('audit-entry')).toHaveCount(25);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/entity=Machine/);
    await expect(page).toHaveURL(new RegExp(`q=${TAG}`));
    await expect(page.getByTestId('audit-entry')).toHaveCount(5);
    await expect(page.getByText('Page 2 of 2')).toBeVisible();

    await context.close();
  });

  test('pre-migration and unwired rows fall back to raw codes and no-details copy', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    createAuditLogs([
      {
        action: 'MACHINE_UPDATE',
        entity: `Machine:${TAG}-old`,
        adminEmail: ADMIN_EMAIL,
      },
      {
        action: 'NEWS_UPDATE',
        entity: `NewsPost:${TAG}-unwired`,
        adminEmail: ADMIN_EMAIL,
      },
      {
        action: 'MACHINE_UPDATE',
        entity: `Machine:${TAG}-noop`,
        adminEmail: ADMIN_EMAIL,
        details: fixtureDetails(`No-op machine ${TAG}`, `آلة ${TAG}`),
      },
    ]);

    await page.goto(`${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(TAG)}`);
    const entries = page.getByTestId('audit-entry');
    await expect(entries).toHaveCount(3);

    const oldRow = entries.filter({
      hasText: `MACHINE_UPDATE Machine:${TAG}-old`,
    });
    await expect(oldRow).toHaveCount(1);
    await expect(oldRow.locator('summary')).toContainText('Details');
    await openEntryDetails(oldRow);
    await expect(oldRow).toContainText('No details recorded for this entry.');

    const unwired = entries.filter({
      hasText: `NEWS_UPDATE NewsPost:${TAG}-unwired`,
    });
    await expect(unwired).toHaveCount(1);
    await openEntryDetails(unwired);
    await expect(unwired).toContainText('No details recorded for this entry.');

    const noop = entries.filter({
      hasText: `Updated machine No-op machine ${TAG}`,
    });
    await expect(noop).toHaveCount(1);
    await expect(noop.locator('summary')).toContainText('Changes (0)');
    await openEntryDetails(noop);
    await expect(noop).toContainText(
      'No field changes were recorded for this entry.'
    );

    // The old rows really are stored without details; nothing was faked in
    // the page.
    const stored = auditLogsByTag(TAG);
    const old = stored.find((row) => row.entity.endsWith('-old'));
    expect(old?.details).toBeNull();

    await context.close();
  });

  test('Arabic copy is RTL and the card layout fits 390px in both locales', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser);
    createAuditLogs([
      {
        action: 'MACHINE_UPDATE',
        entity: `Machine:${TAG}-responsive`,
        adminEmail: ADMIN_EMAIL,
        details: {
          changes: [
            {
              field: 'nameEn',
              labelKey: 'nameEn',
              type: 'text',
              from: `Old name ${TAG}`,
              to: `New name ${TAG}`,
            },
          ],
          label: {
            en: `Responsive machine ${TAG}`,
            ar: `ماكينة ${TAG}`,
          },
          search: `responsive machine ${TAG} ماكينة ${TAG}`.toLowerCase(),
        },
      },
    ]);

    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${ADMIN_URL}/en/audit-log?q=${encodeURIComponent(TAG)}`);
    const englishEntry = page.getByTestId('audit-entry');
    await expect(englishEntry).toHaveCount(1);
    await openEntryDetails(englishEntry);
    // Below md the table is replaced by stacked cards.
    const englishCards = englishEntry.locator('details ul');
    await expect(englishCards).toBeVisible();
    await expect(englishCards).toContainText('Name (English)');
    await expect(englishCards).toContainText(`Old name ${TAG}`);
    await expect(englishCards).toContainText(`New name ${TAG}`);
    const englishWidths = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(englishWidths.scroll).toBeLessThanOrEqual(englishWidths.client + 1);

    await page.goto(`${ADMIN_URL}/ar/audit-log?q=${encodeURIComponent(TAG)}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const arabicEntry = page.getByTestId('audit-entry');
    await expect(arabicEntry).toHaveCount(1);
    await expect(arabicEntry).toContainText(`حُدّثت آلة ماكينة ${TAG}`);
    await expect(arabicEntry.locator('summary')).toContainText('التغييرات (1)');
    await openEntryDetails(arabicEntry);
    const arabicCards = arabicEntry.locator('details ul');
    await expect(arabicCards).toBeVisible();
    await expect(arabicCards).toContainText('الاسم (بالإنجليزية)');
    await expect(arabicCards).toContainText(`Old name ${TAG}`);
    await expect(arabicCards).toContainText(`New name ${TAG}`);
    const arabicWidths = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(arabicWidths.scroll).toBeLessThanOrEqual(arabicWidths.client + 1);

    await context.close();
  });
});
