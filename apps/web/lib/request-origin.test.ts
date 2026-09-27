import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameOrigin } from './request-origin';

const APP_URL = 'https://web.example.test';

function postTo(path: string, origin: string | null) {
  return new Request(`https://web.example.test${path}`, {
    method: 'POST',
    headers: origin ? { origin } : {},
  });
}

describe('isSameOrigin', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllEnvs();
  });

  it('accepts a matching origin (ignoring path/query)', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', APP_URL);
    expect(isSameOrigin(postTo('/api/contact', APP_URL))).toBe(true);
    expect(isSameOrigin(postTo('/api/contact', `${APP_URL}/ar?x=1`))).toBe(
      true
    );
  });

  it('rejects a foreign origin', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', APP_URL);
    expect(isSameOrigin(postTo('/api/contact', 'https://evil.test'))).toBe(
      false
    );
  });

  it('rejects a missing origin', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', APP_URL);
    expect(isSameOrigin(postTo('/api/contact', null))).toBe(false);
  });

  it('rejects a malformed origin', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', APP_URL);
    expect(isSameOrigin(postTo('/api/contact', 'not a url %%'))).toBe(false);
  });

  it('fails closed in production without NEXT_PUBLIC_WEB_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.NEXT_PUBLIC_WEB_URL;
    expect(isSameOrigin(postTo('/api/contact', APP_URL))).toBe(false);
  });

  it('fails open with a warning outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.NEXT_PUBLIC_WEB_URL;
    expect(isSameOrigin(postTo('/api/contact', APP_URL))).toBe(true);
  });
});
