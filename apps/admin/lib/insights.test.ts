import { describe, expect, it } from 'vitest';
import {
  clampPage,
  isSecurityEventType,
  parseEventType,
  parsePage,
  SECURITY_EVENT_TYPES,
} from './insights';

describe('parseEventType', () => {
  it('accepts the three stored codes', () => {
    for (const type of SECURITY_EVENT_TYPES) {
      expect(parseEventType(type)).toBe(type);
    }
  });

  it('treats an absent or unknown code as "every type"', () => {
    expect(parseEventType(undefined)).toBeUndefined();
    expect(parseEventType('')).toBeUndefined();
    expect(parseEventType('rate_limited')).toBeUndefined();
    expect(parseEventType('LOGIN_FAILED ')).toBeUndefined();
  });

  it('isSecurityEventType rejects codes the schema does not have', () => {
    expect(isSecurityEventType('RATE_LIMITED')).toBe(true);
    expect(isSecurityEventType('SOMETHING_NEW')).toBe(false);
  });
});

describe('parsePage / clampPage', () => {
  it('parses a positive page and rejects the rest', () => {
    expect(parsePage('3')).toBe(3);
    for (const value of [undefined, '', '0', '-2', 'two', 'abc']) {
      expect(parsePage(value), String(value)).toBe(1);
    }
  });

  it('pins a page past the end to the last one', () => {
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(1, 1)).toBe(1);
  });

  it('never returns less than page 1, even with no pages at all', () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(0, 0)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
  });
});
