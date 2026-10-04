import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import ar from '../messages/ar.json';

// The admin is bilingual, so the two message files are load-bearing: a key
// added to one and not the other is a runtime error the first time that
// string is rendered in the other language. These tests fail the build
// instead.

type Messages = { [key: string]: string | Messages };

function flatten(value: Messages, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      out[path] = child;
    } else {
      Object.assign(out, flatten(child, path));
    }
  }
  return out;
}

const enFlat = flatten(en as Messages);
const arFlat = flatten(ar as Messages);

describe('admin message files', () => {
  it('ar.json has exactly the same keys as en.json', () => {
    const missingInAr = Object.keys(enFlat).filter((key) => !(key in arFlat));
    const missingInEn = Object.keys(arFlat).filter((key) => !(key in enFlat));
    expect({ missingInAr, missingInEn }).toEqual({
      missingInAr: [],
      missingInEn: [],
    });
  });

  it('has no empty strings', () => {
    const blank = Object.entries(enFlat)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it('uses the same ICU placeholders in both languages', () => {
    // A placeholder present in one language and missing in the other throws
    // at render time (or silently drops the value), so they must match.
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\s*([\w.]+)/g)].map((m) => m[1]).sort();

    const mismatched = Object.keys(enFlat).filter(
      (key) =>
        JSON.stringify(placeholders(enFlat[key])) !==
        JSON.stringify(placeholders(arFlat[key]))
    );
    expect(mismatched).toEqual([]);
  });

  it('has balanced ICU braces and only valid plural categories', () => {
    const problems: string[] = [];
    for (const [locale, messages] of [
      ['en', enFlat],
      ['ar', arFlat],
    ] as const) {
      for (const [key, value] of Object.entries(messages)) {
        const open = (value.match(/{/g) ?? []).length;
        const close = (value.match(/}/g) ?? []).length;
        if (open !== close) {
          problems.push(`${locale}.${key}: unbalanced braces`);
        }
        // `one` is the only category every locale is required to provide.
        for (const match of value.matchAll(/plural,\s*([^{]*)\{/g)) {
          if (!/\bone\b/.test(match[1])) {
            problems.push(`${locale}.${key}: plural without a "one" branch`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the lead status codes in sync with the message keys', () => {
    // `lib/lead-status.ts` holds the stored enum; the `Leads.statuses.*`
    // keys are their labels. A status added to one and not the other would
    // render as a raw code.
    const source = readFileSync(
      join(import.meta.dirname, 'lead-status.ts'),
      'utf8'
    );
    const declared = source.match(/LEAD_STATUSES = \[([^\]]*)\]/)?.[1];
    expect(declared).toBeDefined();
    const statuses = declared!
      .split(',')
      .map((value) => value.trim().replace(/['\s]/g, ''))
      .filter(Boolean);

    expect(statuses).toEqual(['NEW', 'IN_PROGRESS', 'RESOLVED']);
    for (const status of statuses) {
      expect(Object.keys(enFlat)).toContain(`Leads.statuses.${status}`);
      expect(Object.keys(arFlat)).toContain(`Leads.statuses.${status}`);
    }
  });

  it('keeps the security event type codes in sync with the message keys', () => {
    // Same guard for `SECURITY_EVENT_TYPES` in lib/insights.ts, whose
    // `Insights.eventTypes.*` keys are their labels. The dashboard also
    // renders a tile per type, so a code without a label would show a raw
    // enum value where a translated name belongs.
    const source = readFileSync(
      join(import.meta.dirname, 'insights.ts'),
      'utf8'
    );
    const declared = source.match(/SECURITY_EVENT_TYPES = \[([^\]]*)\]/)?.[1];
    expect(declared).toBeDefined();
    const types = declared!
      .split(',')
      .map((value) => value.trim().replace(/['\s]/g, ''))
      .filter(Boolean);

    expect(types).toEqual(['RATE_LIMITED', 'HONEYPOT_CAUGHT', 'LOGIN_FAILED']);
    for (const type of types) {
      expect(Object.keys(enFlat)).toContain(`Insights.eventTypes.${type}`);
      expect(Object.keys(arFlat)).toContain(`Insights.eventTypes.${type}`);
    }
  });
});
