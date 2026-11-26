import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';

describe('admin robots.txt', () => {
  it('disallows every path', () => {
    expect(robots().rules).toMatchObject({
      userAgent: '*',
      disallow: '/',
    });
  });
});
