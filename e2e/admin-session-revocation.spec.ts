import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_PASSWORD,
  ADMIN_URL,
  copyFor,
  loginState,
} from './admin-session';
import {
  DATABASE_URL,
  EDITOR,
  bumpEditorSessionVersion,
  ensureEditor,
  removeEditor,
  restoreEditorSessionVersion,
} from './admin-editor';

// Stage 2b: the JWT is not the authority — the AdminUser row is. Bumping
// `sessionVersion` (what a password reset does) must invalidate a session
// that is still signed, unexpired and present in the browser:
//   - a page navigation is redirected to /login by the layout gate;
//   - a replayed Server Action is rejected by requireAdmin().
// The normal session is exercised before the bump and after restoring the
// version, so the spec also proves the check is not a blanket refusal.
//
// Uses the shared throwaway editor fixture: bumping the real admin would
// invalidate the storage state every other spec reuses. The version is
// restored in a finally so those specs keep working.

/**
 * A leads Server Action id from Next's per-route reference manifests (dev
 * and production layouts). The body sent by the test is an empty item list,
 * so even a bug that let the action run could not delete anything — the
 * assertion is about requireAdmin() rejecting a revoked session.
 */
function leadsActionId(): string | null {
  for (const relative of [
    '../apps/admin/.next/dev/server/app/[locale]/leads/page/server-reference-manifest.json',
    '../apps/admin/.next/dev/server/app/[locale]/leads/[kind]/[id]/page/server-reference-manifest.json',
    '../apps/admin/.next/server/app/[locale]/leads/page/server-reference-manifest.json',
    '../apps/admin/.next/server/app/[locale]/leads/[kind]/[id]/page/server-reference-manifest.json',
  ]) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(__dirname, relative), 'utf8')
      ) as {
        node?: Record<string, { filename?: string; exportedName?: string }>;
      };
      const match = Object.entries(manifest.node ?? {}).find(([, value]) => {
        const filename = value.filename ?? '';
        return (
          filename.endsWith('lib/actions/leads.ts') &&
          (value.exportedName === 'deleteLead' ||
            value.exportedName === 'deleteLeads')
        );
      });
      if (match) {
        return match[0];
      }
    } catch {
      // No manifest (or no leads action in it): try the next location.
    }
  }
  return null;
}

test.describe('admin session revocation', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
  test.skip(!DATABASE_URL, 'DATABASE_URL env is required');

  test.beforeAll(() => {
    ensureEditor();
  });

  test.afterAll(() => {
    if (DATABASE_URL) {
      removeEditor();
    }
  });

  test('a bumped sessionVersion revokes page access and server actions', async ({
    browser,
  }) => {
    const en = copyFor('en');
    const state = await loginState(browser, en, EDITOR.email, EDITOR.password);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    // A normal (current-version) session reaches the content sections.
    await page.goto(`${ADMIN_URL}/en/categories`);
    await expect(page.locator('h1')).toBeVisible();

    const { previous, next } = bumpEditorSessionVersion();
    expect(next).toBe(previous + 1);

    try {
      // Same cookie, now stale: the layout gate sends the navigation to the
      // locale's login page instead of rendering the section.
      await page.goto(`${ADMIN_URL}/en/categories`);
      await expect(page).toHaveURL(/\/en\/login(\?|$)/);
      await expect(
        page.getByRole('button', { name: en.submit })
      ).toBeVisible();

      // Replay the exact Server Action wire call the UI makes. The JWT is
      // still present, so the proxy lets it through; requireAdmin() must
      // reject it against the bumped row.
      const actionId = leadsActionId();
      expect(actionId, 'leads action id in the dev manifest').toBeTruthy();
      const response = await page.evaluate(
        async (request: { url: string; id: string; body: string }) => {
          const reply = await fetch(request.url, {
            method: 'POST',
            headers: {
              'Next-Action': request.id,
              'Content-Type': 'application/json',
            },
            body: request.body,
            signal: AbortSignal.timeout(20_000),
          });
          return {
            status: reply.status,
            url: reply.url,
            text: (await reply.text()).slice(0, 40_000),
          };
        },
        {
          url: `${ADMIN_URL}/en/leads`,
          id: actionId as string,
          body: JSON.stringify({
            items: [
              { kind: 'contact', id: 'revoked-session-probe' },
            ],
            kind: 'contact',
            id: 'revoked-session-probe',
          }),
        }
      );
      expect(response.text).not.toContain('"ok":true');
      const rejected =
        response.url.includes('/login') ||
        response.text.includes('unauthorized');
      expect(rejected, JSON.stringify(response).slice(0, 500)).toBe(true);
    } finally {
      // Put the shared fixture back exactly as it was.
      restoreEditorSessionVersion(previous);
    }

    // The restored version matches the still-present cookie again: the same
    // browser is welcome without a new sign-in.
    await page.goto(`${ADMIN_URL}/en/categories`);
    await expect(page.locator('h1')).toBeVisible();

    await context.close();
  });
});
