import { cache } from 'react';
import { prisma } from '@colina/db';
import {
  sanitizeContactEmail,
  sanitizeContactPhone,
  trimmedOrNull,
} from './contact';

export type AgentLocale = 'ar' | 'en';

/**
 * One agent as the public /agents page renders it.
 *
 * The Agent row is admin-entered data and therefore untrusted: every free-text
 * field is trimmed (blank → null) and the contact values are re-validated on
 * read, so a stale or hand-edited row hides that contact instead of producing
 * a broken `tel:`/`mailto:` link or an off-site `javascript:` one. Rendering
 * only ever uses React text nodes — the database is never interpreted as HTML.
 *
 * Unpublished rows never reach this type: `getAgents` filters them in the
 * query and `sanitizeAgent` drops any row that still says otherwise.
 */
export type AgentContact = {
  id: string;
  countryEn: string;
  countryAr: string;
  /** Display name, already falling back to the other language / null. */
  nameEn: string | null;
  nameAr: string | null;
  cityEn: string | null;
  cityAr: string | null;
  addressEn: string | null;
  addressAr: string | null;
  /** Display value, already validated by `sanitizeContactPhone`. */
  phone: string | null;
  /** Address, already validated by `sanitizeContactEmail`. */
  email: string | null;
  /** Absolute http(s) URL without credentials, or null. */
  websiteUrl: string | null;
  /** The URL's host, for the visible link text (e.g. `nile.example.com`). */
  websiteHost: string | null;
  /** Absolute https image URL, or null. */
  logoUrl: string | null;
};

/** One country section: the agents that share the same country. */
export type AgentCountryGroup = {
  countryEn: string;
  countryAr: string;
  agents: AgentContact[];
};

/** The columns the public page reads — nothing else is ever selected. */
const AGENT_SELECT = {
  id: true,
  countryEn: true,
  countryAr: true,
  nameEn: true,
  nameAr: true,
  cityEn: true,
  cityAr: true,
  addressEn: true,
  addressAr: true,
  phone: true,
  email: true,
  websiteUrl: true,
  logoUrl: true,
  isPublished: true,
} as const;

type AgentRow = {
  id: string;
  countryEn: string;
  countryAr: string;
  nameEn: string | null;
  nameAr: string | null;
  cityEn: string | null;
  cityAr: string | null;
  addressEn: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  isPublished: boolean;
};

/**
 * Parses a stored URL that must be absolute, credential-free and use one of
 * the allowed schemes. Returns the trimmed original (the href a visitor gets)
 * and the parsed host (the value the card shows), or null.
 *
 * The length cap matches the admin form's maximum: a value past it is not
 * something the write side could have produced, so the read side ignores it.
 */
function parseAbsoluteUrl(
  value: string | null | undefined,
  protocols: readonly string[]
): { url: string; host: string } | null {
  const trimmed = trimmedOrNull(value);
  if (trimmed === null || trimmed.length > 2048) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!protocols.includes(parsed.protocol)) {
    return null;
  }
  // `https://user:secret@host` would put credentials in both the href and the
  // visible host; the admin form refuses them, and a hand-edited row must too.
  if (parsed.username !== '' || parsed.password !== '') {
    return null;
  }
  if (parsed.hostname === '') {
    return null;
  }

  return { url: trimmed, host: parsed.host };
}

/**
 * The agent's website, or null.
 *
 * Absolute http(s) only: a bare `nile.example.com` is display text, not a
 * link, and anything with another scheme — `javascript:` in particular — must
 * never become an `href` on a public page.
 */
export function sanitizeAgentWebsite(
  value: string | null | undefined
): { url: string; host: string } | null {
  return parseAbsoluteUrl(value, ['http:', 'https:']);
}

/**
 * The agent's logo, or null.
 *
 * https only: the public site's CSP allows any https image but no http one,
 * so an http URL would be a broken tile the browser refuses to fetch.
 */
export function sanitizeAgentLogo(
  value: string | null | undefined
): string | null {
  return parseAbsoluteUrl(value, ['https:'])?.url ?? null;
}

/**
 * Re-validates one agent row for public display, or drops it.
 *
 * A row whose country is blank in both languages cannot be grouped or
 * identified, so it is dropped rather than rendered under an empty heading.
 * A row that is not explicitly published is dropped too — the query already
 * excludes it, but the public page must not depend on that one line alone.
 */
export function sanitizeAgent(row: AgentRow): AgentContact | null {
  if (row.isPublished !== true) {
    return null;
  }

  const countryEn = trimmedOrNull(row.countryEn);
  const countryAr = trimmedOrNull(row.countryAr);
  if (countryEn === null && countryAr === null) {
    return null;
  }
  // An email that reaches the public page becomes a `mailto:` href. The
  // contact sanitizer accepts anything with one `@` and a dotted domain —
  // deliberately loose for display text — but a colon would smuggle a second
  // scheme into the href (`javascript:x@y.z` is caught by the `@` rule, while
  // `scheme:payload@host` is not), so the agent read side rejects colons.
  const email = sanitizeContactEmail(row.email);
  const website = sanitizeAgentWebsite(row.websiteUrl);
  return {
    id: row.id,
    countryEn: countryEn ?? countryAr ?? '',
    countryAr: countryAr ?? countryEn ?? '',
    // Both language sides fall back to the other language's wording, keeping
    // a half-filled row from rendering blank fields on the page.
    nameEn: trimmedOrNull(row.nameEn) ?? trimmedOrNull(row.nameAr),
    nameAr: trimmedOrNull(row.nameAr) ?? trimmedOrNull(row.nameEn),
    cityEn: trimmedOrNull(row.cityEn) ?? trimmedOrNull(row.cityAr),
    cityAr: trimmedOrNull(row.cityAr) ?? trimmedOrNull(row.cityEn),
    addressEn: trimmedOrNull(row.addressEn) ?? trimmedOrNull(row.addressAr),
    addressAr: trimmedOrNull(row.addressAr) ?? trimmedOrNull(row.addressEn),
    phone: sanitizeContactPhone(row.phone),
    email: email !== null && !email.includes(':') ? email : null,
    websiteUrl: website?.url ?? null,
    websiteHost: website?.host ?? null,
    logoUrl: sanitizeAgentLogo(row.logoUrl),
  };
}

/**
 * Nullable localized text: both null ties, null sorts last, otherwise the
 * locale's collation decides. Used for the city and the name so the two rules
 * cannot drift apart.
 */
function compareLocalized(
  a: string | null,
  b: string | null,
  collator: Intl.Collator
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return collator.compare(a, b);
}

/**
 * Groups flat agents into country sections.
 *
 * Countries with no agents are not emitted (the page shows its empty state
 * when nothing is left at all). Grouping is language-independent: rows are
 * grouped by their country pair regardless of the viewing locale, so the
 * same agent never appears under two sections in different languages.
 *
 * Ordering: countries alphabetically by the LOCALIZED name (Arabic collation
 * for `ar`, English for `en` — the localized name is exactly what the section
 * heading shows, so the visual order is the alphabetical order). Agents are
 * sorted by the localized city (city-less last), then the localized name
 * (nameless last), then the id — the last two tiebreaks keep the order
 * deterministic when several agents share a city.
 */
export function buildAgentGroups(
  agents: AgentContact[],
  locale: AgentLocale
): AgentCountryGroup[] {
  const localizedCountry = (agent: AgentContact) =>
    locale === 'ar' ? agent.countryAr : agent.countryEn;
  const collator = new Intl.Collator(locale === 'ar' ? 'ar' : 'en');

  const groups = new Map<string, AgentCountryGroup>();
  for (const agent of agents) {
    // Language-independent key: the paired labels, lowercased, with the other
    // language standing in for a blank side. First-seen wording wins.
    const key = `${agent.countryEn.toLowerCase()}||${agent.countryAr.toLowerCase()}`;
    const group = groups.get(key);
    if (group) {
      group.agents.push(agent);
    } else {
      groups.set(key, {
        countryEn: agent.countryEn,
        countryAr: agent.countryAr,
        agents: [agent],
      });
    }
  }

  for (const group of groups.values()) {
    group.agents.sort((a, b) => {
      const byCity = compareLocalized(
        locale === 'ar' ? a.cityAr : a.cityEn,
        locale === 'ar' ? b.cityAr : b.cityEn,
        collator
      );
      if (byCity !== 0) return byCity;

      const byName = compareLocalized(
        locale === 'ar' ? a.nameAr : a.nameEn,
        locale === 'ar' ? b.nameAr : b.nameEn,
        collator
      );
      if (byName !== 0) return byName;

      return compareIds(a, b);
    });
  }

  return [...groups.values()].sort((a, b) =>
    collator.compare(localizedCountry(a.agents[0]), localizedCountry(b.agents[0]))
  );
}

/** createdAt is not carried to the public layer; the id keeps ties stable. */
function compareIds(a: AgentContact, b: AgentContact): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every published agent, grouped for the /agents page.
 *
 * Same contract as `getSiteSettings`: a missing table, a connection failure
 * or an unexpected value must never take a public page down, so the failure
 * collapses to "no agents" and the page renders its empty state. The log
 * carries the error NAME only — a Prisma error can echo input values and the
 * rows contain phone numbers and email addresses. `cache()` deduplicates the
 * read within one request tree; it does not make the route dynamic — the
 * page stays static with an hourly ISR window.
 */
export const getAgents = cache(async (
  locale: AgentLocale
): Promise<AgentCountryGroup[]> => {
  try {
    const rows = await prisma.agent.findMany({
      // Hidden agents never reach the page. The read-side check in
      // `sanitizeAgent` repeats this rule defensively.
      where: { isPublished: true },
      // Creation order is the base order; `buildAgentGroups` applies the
      // localized display sort on top of it.
      orderBy: [{ createdAt: 'asc' }],
      select: AGENT_SELECT,
    });
    const agents = rows
      .map((row) => sanitizeAgent(row as AgentRow))
      .filter((agent): agent is AgentContact => agent !== null);
    return buildAgentGroups(agents, locale);
  } catch (error) {
    console.error(
      '[web] getAgents failed:',
      error instanceof Error ? error.name : 'unknown error'
    );
    return [];
  }
});
