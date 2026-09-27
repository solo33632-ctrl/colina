import type { getTranslations } from 'next-intl/server';
import type messages from '../../messages/en.json';
import type {
  AgentFieldMessages,
  CategoryFieldMessages,
  MachineFieldMessages,
  NewsFieldMessages,
  PartnerFieldMessages,
  ServiceFieldMessages,
} from '../schemas';

// Validation messages, localized — and defined exactly once.
//
// The Zod RULES live in `lib/schemas.ts` and take their messages as
// arguments, so what changes per language is only the wording. Each mapper
// below is a pure function of a translator, which means the Server Actions
// and the client forms build their schemas from the same keys and cannot
// drift: a field is validated with identical wording on both sides of the
// submit.
//
// A Server Action resolves its locale from the `x-next-intl-locale` header
// that `NextIntlClientProvider` attaches to the action request, so a
// validation failure comes back in the language the admin is working in —
// which matters here because the forms render these messages verbatim.

// The translator shape for one namespace, derived from the English message
// file (the project's source of message-key types) so it tracks the files
// automatically.
type Namespace = keyof typeof messages;
type Translator<NS extends Namespace> = Awaited<
  // Instantiation expression over the overload set, picking the named one.
  ReturnType<typeof getTranslations<NS>>
>;

export function categoryMessages(
  t: Translator<'Categories'>
): CategoryFieldMessages {
  return {
    nameAr: t('validation.nameAr'),
    nameEn: t('validation.nameEn'),
    slug: t('validation.slug'),
    descriptionAr: t('validation.descriptionAr'),
    descriptionEn: t('validation.descriptionEn'),
    image: t('validation.image'),
  };
}

export function machineMessages(
  t: Translator<'Machines'>
): MachineFieldMessages {
  return {
    nameAr: t('validation.nameAr'),
    nameEn: t('validation.nameEn'),
    slug: t('validation.slug'),
    categoryId: t('validation.categoryId'),
    shortDescriptionAr: t('validation.shortDescriptionAr'),
    shortDescriptionEn: t('validation.shortDescriptionEn'),
    descriptionAr: t('validation.descriptionAr'),
    descriptionEn: t('validation.descriptionEn'),
    specsAr: t('validation.specsAr'),
    specsEn: t('validation.specsEn'),
    imageUrl: t('validation.imageUrl'),
    imagePosition: t('validation.imagePosition'),
    datasheetUrl: t('validation.datasheetUrl'),
  };
}

export function partnerMessages(
  t: Translator<'Partners'>
): PartnerFieldMessages {
  return {
    nameAr: t('validation.nameAr'),
    nameEn: t('validation.nameEn'),
    logo: t('validation.logo'),
  };
}

export function serviceMessages(
  t: Translator<'Services'>
): ServiceFieldMessages {
  return {
    slug: t('validation.slug'),
    titleAr: t('validation.titleAr'),
    titleEn: t('validation.titleEn'),
    descriptionAr: t('validation.descriptionAr'),
    descriptionEn: t('validation.descriptionEn'),
    scopeAr: t('validation.scopeAr'),
    scopeEn: t('validation.scopeEn'),
    icon: t('validation.icon'),
  };
}

export function newsMessages(t: Translator<'News'>): NewsFieldMessages {
  return {
    slug: t('validation.slug'),
    titleAr: t('validation.titleAr'),
    titleEn: t('validation.titleEn'),
    bodyAr: t('validation.bodyAr'),
    bodyEn: t('validation.bodyEn'),
    image: t('validation.image'),
    publishedAt: t('validation.publishedAt'),
  };
}

export function agentMessages(t: Translator<'Agents'>): AgentFieldMessages {
  return {
    countryAr: t('validation.countryAr'),
    countryEn: t('validation.countryEn'),
  };
}
