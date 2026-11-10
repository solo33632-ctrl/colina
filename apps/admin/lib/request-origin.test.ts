import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSameOrigin } from './request-origin';

const APP_URL = 'http://localhost:3001';

function postTo(
  path: string,
  origin: string | null,
  url = `${APP_URL}${path}`
) {
  return new Request(url, {
    method: 'POST',
    headers: origin ? { origin } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('NEXTAUTH_URL', APP_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isSameOrigin', () => {
  it('accepts a matching origin (ignoring path/query)', () => {
    expect(isSameOrigin(postTo('/api/auth/forgot-password', APP_URL))).toBe(
      true
    );
    expect(
      isSameOrigin(
        postTo('/api/auth/forgot-password', `${APP_URL}/en?x=1`)
      )
    ).toBe(true);
  });

  it('accepts the configured public origin behind a proxy', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://admin.example.test');
    expect(
      isSameOrigin(
        postTo(
          '/api/auth/reset-password',
          'https://admin.example.test',
          'http://internal:3001/api/auth/reset-password'
        )
      )
    ).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(
      isSameOrigin(postTo('/api/auth/forgot-password', 'https://evil.test'))
    ).toBe(false);
  });

  it('rejects a missing origin', () => {
    expect(isSameOrigin(postTo('/api/auth/forgot-password', null))).toBe(
      false
    );
  });

  it('rejects a malformed origin', () => {
    expect(
      isSameOrigin(postTo('/api/auth/forgot-password', 'not a url %%'))
    ).toBe(false);
  });

  it('fails closed in production without NEXTAUTH_URL', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXTAUTH_URL', '');

    expect(isSameOrigin(postTo('/api/auth/forgot-password', APP_URL))).toBe(
      false
    );
    expect(error).toHaveBeenCalledWith(
      '[origin-check] NEXTAUTH_URL is not set — refusing request.'
    );
  });

  it('uses the request host with a warning outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXTAUTH_URL', '');

    expect(isSameOrigin(postTo('/api/auth/forgot-password', APP_URL))).toBe(
      true
    );
    expect(
      isSameOrigin(postTo('/api/auth/forgot-password', 'https://evil.test'))
    ).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects an https origin when a no-config request was http', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXTAUTH_URL', '');
    expect(
      isSameOrigin(
        postTo('/api/auth/forgot-password', 'https://localhost:3001')
      )
    ).toBe(false);
  });

  it('fails closed when NEXTAUTH_URL is malformed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXTAUTH_URL', 'not a url %%');

    expect(isSameOrigin(postTo('/api/auth/forgot-password', APP_URL))).toBe(
      false
    );
    expect(error).toHaveBeenCalledWith(
      '[origin-check] NEXTAUTH_URL is not a valid URL — refusing request.'
    );
  });
});
