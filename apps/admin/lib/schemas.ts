import { z } from 'zod';

// Admin form validation. Same factory pattern as apps/web/lib/schemas.ts:
// rules live here once, messages are injected (admin strings are hardcoded
// English per the Phase 3 admin-stays-English decision — no message files).

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

export type LoginFieldMessages = {
  email: string;
  password: string;
};

export function loginInputSchema(messages: LoginFieldMessages) {
  return z.object({
    email: z.email({ error: messages.email }),
    password: z.string().min(1, { error: messages.password }),
  });
}

export type LoginInput = z.infer<ReturnType<typeof loginInputSchema>>;

export function forgotPasswordInputSchema(messages: { email: string }) {
  return z.object({
    email: z.email({ error: messages.email }),
  });
}

export function resetPasswordInputSchema(messages: {
  token: string;
  password: string;
}) {
  return z.object({
    token: z.string().min(1, { error: messages.token }),
    password: z
      .string()
      .min(ADMIN_PASSWORD_MIN_LENGTH, { error: messages.password }),
  });
}
