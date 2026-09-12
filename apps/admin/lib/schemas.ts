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

const slugRule = (message: string) =>
  z
    .string()
    .min(2, { error: message })
    .regex(/^[a-z0-9-]+$/, { error: message });

export type CategoryFieldMessages = {
  nameAr: string;
  nameEn: string;
  slug: string;
  descriptionAr: string;
  descriptionEn: string;
};

export function categoryInputSchema(messages: CategoryFieldMessages) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    slug: slugRule(messages.slug),
    descriptionAr: z.string().min(10, { error: messages.descriptionAr }),
    descriptionEn: z.string().min(10, { error: messages.descriptionEn }),
    // Plain URL text for now (no shared filesystem/storage yet — replace
    // with a real upload experience once Phase 16 picks a backend).
    image: z.string().optional(),
  });
}

export type CategoryInput = z.infer<ReturnType<typeof categoryInputSchema>>;

export type MachineFieldMessages = CategoryFieldMessages & {
  categoryId: string;
  shortDescriptionAr: string;
  shortDescriptionEn: string;
  specsAr: string;
  specsEn: string;
  imageUrl: string;
  imagePosition: string;
};

export function machineInputSchema(messages: MachineFieldMessages) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    slug: slugRule(messages.slug),
    categoryId: z.string().min(1, { error: messages.categoryId }),
    shortDescriptionAr: z
      .string()
      .min(10, { error: messages.shortDescriptionAr }),
    shortDescriptionEn: z
      .string()
      .min(10, { error: messages.shortDescriptionEn }),
    descriptionAr: z.string().min(10, { error: messages.descriptionAr }),
    descriptionEn: z.string().min(10, { error: messages.descriptionEn }),
    specsAr: z.string().min(1, { error: messages.specsAr }),
    specsEn: z.string().min(1, { error: messages.specsEn }),
    datasheetUrl: z.string().optional(),
    images: z.array(
      z.object({
        url: z.string().min(1, { error: messages.imageUrl }),
        position: z.number().int().min(0, { error: messages.imagePosition }),
      })
    ),
    relatedIds: z.array(z.string().min(1)),
  });
}

export type MachineInput = z.infer<ReturnType<typeof machineInputSchema>>;
