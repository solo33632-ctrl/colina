import { describe, expect, it } from 'vitest';
import { adminDeleteBlock } from './admin-users';

describe('adminDeleteBlock', () => {
  const base = {
    actorId: 'admin-1',
    targetId: 'editor-1',
    targetRole: 'EDITOR' as const,
    superAdminCount: 1,
  };

  it('allows deleting another editor', () => {
    expect(adminDeleteBlock(base)).toBeNull();
  });

  it('never allows deleting the acting account', () => {
    expect(
      adminDeleteBlock({
        ...base,
        targetId: 'admin-1',
        targetRole: 'SUPER_ADMIN',
        superAdminCount: 2,
      })
    ).toBe('self');
  });

  it('refuses the last full admin', () => {
    expect(
      adminDeleteBlock({
        ...base,
        targetId: 'admin-2',
        targetRole: 'SUPER_ADMIN',
        superAdminCount: 1,
      })
    ).toBe('last_admin');
  });

  it('refuses every other full admin too', () => {
    expect(
      adminDeleteBlock({
        ...base,
        targetId: 'admin-2',
        targetRole: 'SUPER_ADMIN',
        superAdminCount: 3,
      })
    ).toBe('protected_account');
  });
});
