import { z } from 'zod';
import { parseCoordinates } from './coordinates';
import { normalizeWhatsappNumber } from './whatsapp';

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

// Stored URLs render into <img src> / <a href> on the public site, so only
// absolute http(s) URLs are accepted — javascript:, data:, etc. are
// rejected at validation time (XSS / protocol-smuggling hardening,
// Phase 13). Pre-existing relative seed paths predate this rule and are
// grandfathered data, not new input.
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function optionalHttpUrl(message: string) {
  return z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value === '' || isHttpUrl(value),
      {
        error: message,
      }
    );
}

export function requiredHttpUrl(message: string) {
  return z.string().refine((value) => isHttpUrl(value), { error: message });
}

type CategoryBaseMessages = {
  nameAr: string;
  nameEn: string;
  slug: string;
};

export type CategoryFieldMessages = CategoryBaseMessages & {
  image: string;
};

export function categoryInputSchema(messages: CategoryFieldMessages) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    slug: slugRule(messages.slug),
    // Fully optional: an admin can save a category with the description
    // left completely blank, and the public page then renders no
    // description block at all (Phase 26). The column stays a required
    // Text in the database — blank means the empty string, which the
    // Server Actions normalise from `undefined` here.
    descriptionAr: z.string().optional(),
    descriptionEn: z.string().optional(),
    // Cloudinary uploads store their delivered secure URL here; pasted
    // URLs follow the same absolute-http(s) rule.
    image: optionalHttpUrl(messages.image),
  });
}

export type CategoryInput = z.infer<ReturnType<typeof categoryInputSchema>>;

export type MaintenanceCategoryFieldMessages = CategoryBaseMessages & {
  imageUrl: string;
  sortOrder: string;
};

// A maintenance category is one complete production line. It follows the
// machine-category shape (same slug rule, same optional absolute-URL cover),
// plus an explicit display order. Descriptions are optional because a line can
// be named and assigned before anyone writes copy for it.
export function maintenanceCategoryInputSchema(
  messages: MaintenanceCategoryFieldMessages
) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    slug: slugRule(messages.slug),
    descriptionAr: z.string().optional(),
    descriptionEn: z.string().optional(),
    imageUrl: optionalHttpUrl(messages.imageUrl),
    sortOrder: z
      .number()
      .int()
      .min(0, { error: messages.sortOrder })
      .default(0),
  });
}

export type MaintenanceCategoryInput = z.infer<
  ReturnType<typeof maintenanceCategoryInputSchema>
>;

// The form's field values: `sortOrder` has a schema default, so it is optional
// on the way in but always a number on the way out.
export type MaintenanceCategoryFormInput = z.input<
  ReturnType<typeof maintenanceCategoryInputSchema>
>;

export type MachineFieldMessages = CategoryBaseMessages & {
  categoryId: string;
  shortDescriptionAr: string;
  shortDescriptionEn: string;
  imageUrl: string;
  imagePosition: string;
  datasheetUrl: string;
};

export function machineInputSchema(messages: MachineFieldMessages) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    slug: slugRule(messages.slug),
    categoryId: z.string().min(1, { error: messages.categoryId }),
    // The short description is deliberately still required (min 10): it is
    // the machine page's lead paragraph and the page's meta description /
    // Product JSON-LD, so a blank one would leave the page without its
    // summary. Only the long-form fields below were relaxed (Phase 26).
    shortDescriptionAr: z
      .string()
      .min(10, { error: messages.shortDescriptionAr }),
    shortDescriptionEn: z
      .string()
      .min(10, { error: messages.shortDescriptionEn }),
    // Long-form fields, fully optional: a machine can be saved with the
    // full description and specs blank, and the public page then hides
    // those sections entirely. Same empty-string normalisation as the
    // category description.
    descriptionAr: z.string().optional(),
    descriptionEn: z.string().optional(),
    specsAr: z.string().optional(),
    specsEn: z.string().optional(),
    datasheetUrl: optionalHttpUrl(messages.datasheetUrl),
    images: z.array(
      z.object({
        url: requiredHttpUrl(messages.imageUrl),
        position: z.number().int().min(0, { error: messages.imagePosition }),
      })
    ),
    relatedIds: z.array(z.string().min(1)),
    // No `featured` field. The column still exists in the database and is
    // deliberately left alone (see Machine.featured in the Prisma schema),
    // but nothing in the admin reads or writes it any more, so a form control
    // for it would only look like it did something. Leaving the key out of the
    // update also means an ordinary edit never resets the stored value.
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
    // Uploaded logos land here as Cloudinary secure URLs (same rule as
    // pasted URLs). Optional, like the category and news images: a partner
    // exists before its logo does, and the form's own clear control set an
    // empty string, which a required rule would then refuse to save.
    logo: optionalHttpUrl(messages.logo),
  });
}

export type PartnerInput = z.infer<ReturnType<typeof partnerInputSchema>>;

export type ShowcaseFieldMessages = {
  nameAr: string;
  nameEn: string;
  categoryId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
};

export function showcaseInputSchema(messages: ShowcaseFieldMessages) {
  return z.object({
    nameAr: z.string().min(2, { error: messages.nameAr }),
    nameEn: z.string().min(2, { error: messages.nameEn }),
    // Required on every save: an item belongs to exactly one production line.
    // The column stays nullable for rows that predate categories, and the edit
    // form starts those with an empty select — which fails this rule until the
    // admin chooses one.
    categoryId: z.string().min(1, { error: messages.categoryId }),
    // Fully optional, same rule as the category and machine long-form fields:
    // a blank description saves and simply renders nothing.
    descriptionAr: z.string().optional(),
    descriptionEn: z.string().optional(),
    // BOTH photos required, with the same absolute-http(s) rule every other
    // stored image uses. Required — not optional like a partner's logo — on
    // purpose: the row exists to be a before/after comparison, so a single
    // photo is not a half-finished record but a different thing entirely, and
    // saving it would only produce a card the public section cannot render.
    beforeImageUrl: requiredHttpUrl(messages.beforeImageUrl),
    afterImageUrl: requiredHttpUrl(messages.afterImageUrl),
  });
}

export type ShowcaseInput = z.infer<ReturnType<typeof showcaseInputSchema>>;

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
  image: string;
  publishedAt: string;
};

export function newsInputSchema(messages: NewsFieldMessages) {
  return z.object({
    slug: slugRule(messages.slug),
    titleAr: z.string().min(2, { error: messages.titleAr }),
    titleEn: z.string().min(2, { error: messages.titleEn }),
    bodyAr: z.string().min(10, { error: messages.bodyAr }),
    bodyEn: z.string().min(10, { error: messages.bodyEn }),
    image: optionalHttpUrl(messages.image),
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

export type SiteSettingsFieldMessages = {
  whatsappNumber: string;
  whatsappNumberLeadingZero: string;
  whatsappMessageEn: string;
  whatsappMessageAr: string;
  coordinates: string;
  coordinatesRange: string;
  factoryAddressEn: string;
  factoryAddressAr: string;
  workingHoursEn: string;
  workingHoursAr: string;
  mapsUrl: string;
  mapsUrlLength: string;
};

// Optional free text: trimmed, blank becomes null, and the limit is checked
// after trimming so trailing spaces cannot push a valid value over the edge.
function optionalText(max: number, message: string) {
  return z
    .string()
    .nullable()
    .optional()
    .transform((value, ctx) => {
      const trimmed = value?.trim() ?? '';
      if (trimmed === '') {
        return null;
      }
      if (trimmed.length > max) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return trimmed;
    });
}

// Site-wide settings. The WhatsApp field accepts anything a person might type
// (spaces, "+", "00", brackets) and its OUTPUT is the normalized digits — or
// null for a blank field, which is the valid "hide the button" state. The
// Server Action writes `parsed.data`, so the raw input is never stored.
//
// The factory coordinates work the same way: one pasted string goes in, one
// `{ lat, lng }` pair (or null) comes out, and the action stores the numbers
// only. Addresses and hours are trimmed optional text; `mapsUrl` is a full
// https URL, never http and never a bare path.
export function siteSettingsInputSchema(messages: SiteSettingsFieldMessages) {
  return z.object({
    // `null` is accepted because the form's resolver has already run this
    // transform before the Server Action is called: a blank field arrives as
    // null, not as the raw empty string. Both mean "no WhatsApp".
    whatsappNumber: z
      .string()
      .nullable()
      .optional()
      .transform((value, ctx) => {
        const result = normalizeWhatsappNumber(value ?? '');
        if (!result.ok) {
          ctx.addIssue({
            code: 'custom',
            message:
              result.reason === 'leading_zero'
                ? messages.whatsappNumberLeadingZero
                : messages.whatsappNumber,
          });
          return z.NEVER;
        }
        return result.value;
      }),
    // Both greetings are optional and independent: an English-only or
    // Arabic-only greeting is a complete save. 300 characters is enough for
    // the pre-filled WhatsApp line without becoming a second message body.
    whatsappMessageEn: z
      .string()
      .max(300, { error: messages.whatsappMessageEn })
      .optional(),
    whatsappMessageAr: z
      .string()
      .max(300, { error: messages.whatsappMessageAr })
      .optional(),
    // `null` is accepted for the same reason as the number: the resolver
    // sends null after its transform has run, and both blank forms mean
    // "no factory pin".
    coordinates: z
      .string()
      .nullable()
      .optional()
      .transform((value, ctx) => {
        const result = parseCoordinates(value ?? '');
        if (!result.ok) {
          ctx.addIssue({
            code: 'custom',
            message:
              result.reason === 'out_of_range'
                ? messages.coordinatesRange
                : messages.coordinates,
          });
          return z.NEVER;
        }
        return result.value;
      }),
    factoryAddressEn: optionalText(300, messages.factoryAddressEn),
    factoryAddressAr: optionalText(300, messages.factoryAddressAr),
    workingHoursEn: optionalText(200, messages.workingHoursEn),
    workingHoursAr: optionalText(200, messages.workingHoursAr),
    mapsUrl: z
      .string()
      .nullable()
      .optional()
      .transform((value, ctx) => {
        const trimmed = value?.trim() ?? '';
        if (trimmed === '') {
          return null;
        }
        if (trimmed.length > 500) {
          ctx.addIssue({ code: 'custom', message: messages.mapsUrlLength });
          return z.NEVER;
        }
        try {
          const url = new URL(trimmed);
          // Absolute https only: `javascript:`, `data:` and relative paths
          // either parse with another protocol or fail `new URL` outright.
          if (url.protocol !== 'https:' || url.hostname === '') {
            throw new Error('not an absolute https URL');
          }
        } catch {
          ctx.addIssue({ code: 'custom', message: messages.mapsUrl });
          return z.NEVER;
        }
        return trimmed;
      }),
  });
}

export type SiteSettingsInput = z.infer<
  ReturnType<typeof siteSettingsInputSchema>
>;

// What the form holds before the schema's transform runs: both greetings may
// be omitted, and the number is the raw string in the input.
export type SiteSettingsFormInput = z.input<
  ReturnType<typeof siteSettingsInputSchema>
>;
