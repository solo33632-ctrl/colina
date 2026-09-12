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

export type PartnerFieldMessages = {
  nameAr: string;
  nameEn: string;
  logo: string;
};

export function partnerInputSchema(messages: PartnerFieldMessages) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    // Plain URL text for now (same interim pattern as category images —
    // real uploads arrive once Phase 16 picks a storage backend).
    logo: z.string().min(1, { error: messages.logo }),
  });
}

export type PartnerInput = z.infer<ReturnType<typeof partnerInputSchema>>;

export type ServiceFieldMessages = {
  slug: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  scopeAr: string;
  scopeEn: string;
  icon: string;
};

export function serviceInputSchema(messages: ServiceFieldMessages) {
  return z.object({
    slug: slugRule(messages.slug),
    titleAr: z.string().min(2, { error: messages.titleAr }),
    titleEn: z.string().min(2, { error: messages.titleEn }),
    descriptionAr: z.string().min(10, { error: messages.descriptionAr }),
    descriptionEn: z.string().min(10, { error: messages.descriptionEn }),
    scopeAr: z.string().min(10, { error: messages.scopeAr }),
    scopeEn: z.string().min(10, { error: messages.scopeEn }),
    // Plain text field, no icon picker (icons render as initial tiles on
    // the public site until final content/iconography lands).
    icon: z.string().min(1, { error: messages.icon }),
  });
}

export type ServiceInput = z.infer<ReturnType<typeof serviceInputSchema>>;

export type NewsFieldMessages = {
  slug: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  publishedAt: string;
};

export function newsInputSchema(messages: NewsFieldMessages) {
  return z.object({
    slug: slugRule(messages.slug),
    titleAr: z.string().min(2, { error: messages.titleAr }),
    titleEn: z.string().min(2, { error: messages.titleEn }),
    bodyAr: z.string().min(10, { error: messages.bodyAr }),
    bodyEn: z.string().min(10, { error: messages.bodyEn }),
    image: z.string().optional(),
    // YYYY-MM-DD from a date input; converted to DateTime server-side.
    publishedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: messages.publishedAt })
      .optional(),
  });
}

export type NewsInput = z.infer<ReturnType<typeof newsInputSchema>>;

export type AgentFieldMessages = {
  countryAr: string;
  countryEn: string;
};

export function agentInputSchema(messages: AgentFieldMessages) {
  return z.object({
    countryAr: z.string().min(2, { error: messages.countryAr }),
    countryEn: z.string().min(2, { error: messages.countryEn }),
    cityAr: z.string().optional(),
    cityEn: z.string().optional(),
    addressAr: z.string().optional(),
    addressEn: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  });
}

export type AgentInput = z.infer<ReturnType<typeof agentInputSchema>>;
