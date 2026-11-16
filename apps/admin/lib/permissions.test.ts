import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from './admin-action';
import {
  CAPABILITIES,
  assertCanModify,
  capabilitiesFor,
  requirePermission,
  roleCan,
  type Capability,
} from './permissions';

vi.mock('./admin-action', () => ({
  requireAdmin: vi.fn(),
}));

const ADMIN = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'SUPER_ADMIN' as const,
  },
};

const EDITOR = {
  user: {
    id: 'editor-1',
    email: 'editor@example.com',
    role: 'EDITOR' as const,
  },
};

const EDITOR_CAPABILITIES: Capability[] = [
  'machines:write',
  'categories:write',
  'uploads:machine-media',
];

describe('capability map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declares each capability once', () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });

  it('gives the editor exactly the machine, category and machine-media powers', () => {
    expect([...capabilitiesFor('EDITOR')].sort()).toEqual(
      [...EDITOR_CAPABILITIES].sort()
    );

    for (const capability of CAPABILITIES) {
      expect(roleCan('EDITOR', capability), capability).toBe(
        EDITOR_CAPABILITIES.includes(capability)
      );
    }
  });

  it('gives the full admin every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(roleCan('SUPER_ADMIN', capability), capability).toBe(true);
    }
  });
});

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without a verified session', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null as never);

    await expect(requirePermission('machines:write')).resolves.toBeNull();
  });

  it('lets an editor through only for its three capabilities', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(EDITOR as never);

    for (const capability of CAPABILITIES) {
      const result = await requirePermission(capability);
      if (EDITOR_CAPABILITIES.includes(capability)) {
        expect(result, capability).toBe(EDITOR);
      } else {
        expect(result, capability).toBeNull();
      }
    }
  });

  it('lets the full admin through for every capability', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);

    for (const capability of CAPABILITIES) {
      await expect(requirePermission(capability), capability).resolves.toBe(
        ADMIN
      );
    }
  });
});

describe('ownership helper', () => {
  it('always allows the full admin, including null creators', () => {
    expect(assertCanModify(ADMIN as never, { createdById: null })).toBe(true);
    expect(assertCanModify(ADMIN as never, { createdById: 'other' })).toBe(
      true
    );
    expect(assertCanModify(ADMIN as never, { createdById: 'admin-1' })).toBe(
      true
    );
  });

  it('allows an editor only on rows it created itself', () => {
    expect(assertCanModify(EDITOR as never, { createdById: 'editor-1' })).toBe(
      true
    );
    expect(assertCanModify(EDITOR as never, { createdById: 'editor-2' })).toBe(
      false
    );
    expect(assertCanModify(EDITOR as never, { createdById: null })).toBe(false);
  });
});

// Guard against the stage's central failure mode: a Server Action or route
// handler added without a capability check, reachable by any signed-in editor.
// It is a source scan, not a runtime test, because the thing that must not
// happen is forgetting the call at all.
describe('server endpoint permission guard', () => {
  // One comment per entry, as the stage requires. Everything not here must
  // call requirePermission explicitly.
  const PUBLIC_ROUTE_ALLOWLIST: ReadonlyArray<{
    path: string;
    reason: string;
  }> = [
    {
      path: 'app/api/auth/[...nextauth]/route.ts',
      reason:
        'NextAuth sign-in/sign-out endpoint: it establishes the session, so it cannot require one.',
    },
    {
      path: 'app/api/auth/forgot-password/route.ts',
      reason:
        'Public password-reset request: same-origin checked and rate-limited; must work without a session.',
    },
    {
      path: 'app/api/auth/reset-password/route.ts',
      reason:
        'Public password-reset completion: single-use token, same-origin checked and rate-limited; must work without a session.',
    },
  ];

  const ADMIN_ROOT = join(import.meta.dirname, '..');
  const ACTIONS_DIR = 'lib/actions';
  const API_DIR = 'app/api';

  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  }

  function relativeToAdmin(path: string): string {
    return path
      .slice(ADMIN_ROOT.length + 1)
      .split('\\')
      .join('/');
  }

  /** Every exported function/const in a file, with the text that follows it. */
  function exportedSegments(source: string): { name: string; body: string }[] {
    const matches = [
      ...source.matchAll(
        /^export\s+(?:async\s+)?(?:function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*=)/gm
      ),
    ];
    return matches.map((match, index) => ({
      name: match[1] ?? match[2],
      body: source.slice(
        match.index,
        matches[index + 1]?.index ?? source.length
      ),
    }));
  }

  function serverActionFiles(): string[] {
    return walk(join(ADMIN_ROOT, ACTIONS_DIR))
      .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
      .filter((path) =>
        /^['"]use server['"];?/.test(readFileSync(path, 'utf8'))
      )
      .sort();
  }

  function routeFiles(): string[] {
    return walk(join(ADMIN_ROOT, API_DIR))
      .filter((path) => /route\.(?:ts|tsx)$/.test(path))
      .sort();
  }

  it('finds the Server Action and route files it is meant to scan', () => {
    const actions = serverActionFiles().map(relativeToAdmin);
    const routes = routeFiles().map(relativeToAdmin);

    expect(actions).toContain('lib/actions/machines.ts');
    expect(actions).toContain('lib/actions/uploads.ts');
    expect(actions).not.toContain('lib/actions/validation-messages.ts');
    expect(routes).toContain('app/api/auth/forgot-password/route.ts');
  });

  it('requires an explicit requirePermission call in every Server Action', () => {
    const missing: string[] = [];
    for (const file of serverActionFiles()) {
      const source = readFileSync(file, 'utf8');
      const segments = exportedSegments(source);
      expect(
        segments.length,
        `${relativeToAdmin(file)} exports no functions`
      ).toBeGreaterThan(0);
      for (const segment of segments) {
        if (!segment.body.includes('requirePermission(')) {
          missing.push(`${relativeToAdmin(file)}#${segment.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('requires an explicit requirePermission call in every API route, except the commented public allowlist', () => {
    const allowlisted = new Set(
      PUBLIC_ROUTE_ALLOWLIST.map((entry) => entry.path)
    );
    const routed = new Set(routeFiles().map(relativeToAdmin));

    for (const path of allowlisted) {
      expect(routed.has(path), `allowlist entry does not exist: ${path}`).toBe(
        true
      );
    }

    const missing: string[] = [];
    for (const file of routeFiles()) {
      const relative = relativeToAdmin(file);
      if (allowlisted.has(relative)) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      const segments = exportedSegments(source);
      expect(
        segments.length,
        `${relative} exports no handlers`
      ).toBeGreaterThan(0);
      for (const segment of segments) {
        if (!segment.body.includes('requirePermission(')) {
          missing.push(`${relative}#${segment.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
