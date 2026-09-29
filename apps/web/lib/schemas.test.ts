import { describe, expect, it } from 'vitest';
import {
  contactInputSchema,
  HONEYPOT_FIELD,
  honeypotValue,
  maintenanceRequestInputSchema,
} from './schemas';

// Short fixed messages: these tests pin the RULES (lengths, formats,
// honeypot passthrough), not the translated copy (message files own that).
const MESSAGES = {
  name: 'name-err',
  email: 'email-err',
  phone: 'phone-err',
  message: 'message-err',
};

const validContact = {
  name: 'Sara',
  email: 'sara@example.com',
  phone: '+201001234567',
  message: 'Hello, this message is long enough.',
};

describe('contactInputSchema', () => {
  it('accepts valid input', () => {
    expect(contactInputSchema(MESSAGES).safeParse(validContact).success).toBe(
      true
    );
  });

  it('rejects each field below its minimum with the injected message', () => {
    const result = contactInputSchema(MESSAGES).safeParse({
      name: 'x',
      email: 'nope',
      phone: '1',
      message: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const byField = Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join('.'),
          issue.message,
        ])
      );
      expect(byField).toEqual({
        name: 'name-err',
        email: 'email-err',
        phone: 'phone-err',
        message: 'message-err',
      });
    }
  });

  it('passes the honeypot field through untouched', () => {
    const schema = contactInputSchema(MESSAGES);
    expect(
      schema.safeParse({ ...validContact, [HONEYPOT_FIELD]: '' }).success
    ).toBe(true);
    const filled = schema.safeParse({
      ...validContact,
      [HONEYPOT_FIELD]: 'http://spam.test',
    });
    // Validation never judges the honeypot — the route decides by presence.
    expect(filled.success).toBe(true);
    if (filled.success) {
      expect(filled.data[HONEYPOT_FIELD]).toBe('http://spam.test');
    }
  });
});

describe('honeypotValue', () => {
  it('reports no trap for an absent, blank, or non-string field', () => {
    expect(honeypotValue({ name: 'Sara' })).toBeNull();
    expect(honeypotValue({ [HONEYPOT_FIELD]: '' })).toBeNull();
    expect(honeypotValue({ [HONEYPOT_FIELD]: '   ' })).toBeNull();
    expect(honeypotValue({ [HONEYPOT_FIELD]: 42 })).toBeNull();
    expect(
      honeypotValue({ [HONEYPOT_FIELD]: ['http://spam.test'] })
    ).toBeNull();
  });

  it('reports no trap for a body that is not an object', () => {
    expect(honeypotValue(null)).toBeNull();
    expect(honeypotValue('http://spam.test')).toBeNull();
  });

  it('returns the submitted value when the trap is filled', () => {
    expect(honeypotValue({ [HONEYPOT_FIELD]: 'http://spam.test' })).toBe(
      'http://spam.test'
    );
    // Untrimmed on purpose: the SecurityEvent row records what was
    // submitted, not a cleaned-up version of it.
    expect(honeypotValue({ [HONEYPOT_FIELD]: ' spam \n' })).toBe(' spam \n');
  });
});

describe('maintenanceRequestInputSchema', () => {
  const validMaintenance = {
    ...validContact,
    company: 'Acme Foods',
    machineModel: 'Colina Pro 1000',
  };

  it('accepts valid input with all optionals filled', () => {
    expect(
      maintenanceRequestInputSchema(MESSAGES).safeParse(validMaintenance)
        .success
    ).toBe(true);
  });

  it('accepts missing or empty optional email, rejects a bad one', () => {
    const schema = maintenanceRequestInputSchema(MESSAGES);
    const { email: _dropped, ...withoutEmail } = validMaintenance;
    void _dropped;
    expect(schema.safeParse(withoutEmail).success).toBe(true);
    expect(schema.safeParse({ ...validMaintenance, email: '' }).success).toBe(
      true
    );
    const bad = schema.safeParse({ ...validMaintenance, email: 'nope' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].message).toBe('email-err');
    }
  });

  it('accepts missing optional company/machineModel', () => {
    const schema = maintenanceRequestInputSchema(MESSAGES);
    const { company: _c, machineModel: _m, ...rest } = validMaintenance;
    void _c;
    void _m;
    expect(schema.safeParse(rest).success).toBe(true);
  });
});
