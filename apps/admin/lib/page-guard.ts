import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { AdminSession } from './admin-action';
import { requirePermission, type Capability } from './permissions';

// Stage 4a page gate. Pages outside the editor's area call `guardPage` and an
// editor is sent to the machines list (the existing "forbidden" card is kept
// on settings/insights/audit-log, which have their own explanatory treatment).
//
// The proxy already requires a session and the layout re-verifies it; this is
// the role/capability layer on top, so a page cannot be opened just by typing
// its URL. Ownership of a specific row is checked by the edit page itself with
// `canModifyEntity`, because only that page has loaded the row.
export async function guardPage(capability: Capability): Promise<AdminSession> {
  const session = await requirePermission(capability);
  if (!session) {
    const locale = await getLocale();
    redirect(`/${locale}/machines`);
  }
  return session;
}
