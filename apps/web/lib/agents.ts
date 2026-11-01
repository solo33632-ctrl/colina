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
 * a broken `tel:` or `mailto:` link. Rendering only ever uses React text
 * nodes — the database is never interpreted as HTML.
 *
 * NOTE (Stage 37a): the Agent model has NO website, NO logo/photo, NO
 * active/published flag and NO agent-name field, and the stage forbids schema
 * changes, so those simply do not appear here. The identity of an agent is
 * its country + city; a future schema change can extend this type.
 */
export type AgentContact = {
  id: string;
  countryEn: string;
  countryAr: string;
  cityEn: string | null;
  cityAr: string | null;
  addressEn: string | null;
  addressAr: string | null;
  /** Display value, already validated by `sanitizeContactPhone`. */
  phone: string | null;
  /** Address, already validated by `sanitizeContactEmail`. */
  email: string | null;
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
  cityEn: true,
  cityAr: true,
  addressEn: true,
  addressAr: true,
  phone: true,
  email: true,
} as const;

type AgentRow = {
  id: string;
  countryEn: string;
  countryAr: string;
  cityEn: string | null;
  cityAr: string | null;
  addressEn: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Re-validates one agent row for public display, or drops it.
 *
 * A row whose country is blank in both languages cannot be grouped or
 * identified, so it is dropped rather than rendered under an empty heading.
 */
export function sanitizeAgent(row: AgentRow): AgentContact | null {
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
  return {
    id: row.id,
    countryEn: countryEn ?? countryAr ?? '',
    countryAr: countryAr ?? countryEn ?? '',
    // Both language sides fall back to the other language's wording, keeping
    // a half-filled row from rendering blank fields on the page.
    cityEn: trimmedOrNull(row.cityEn) ?? trimmedOrNull(row.cityAr),
    cityAr: trimmedOrNull(row.cityAr) ?? trimmedOrNull(row.cityEn),
    addressEn: trimmedOrNull(row.addressEn) ?? trimmedOrNull(row.addressAr),
    addressAr: trimmedOrNull(row.addressAr) ?? trimmedOrNull(row.addressEn),
    phone: sanitizeContactPhone(row.phone),
    email: email !== null && !email.includes(':') ? email : null,
  };
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
 * sorted by the localized city, agents with no city kept last, ties keeping
 * the admin's creation order via the id — the model has no name or sortOrder
 * field to sort by (reported in Stage 37a), so this is the deterministic
 * fallback.
 */
export function buildAgentGroups(
  agents: AgentContact[],
  locale: AgentLocale
): AgentCountryGroup[] {
  const localized = (agent: AgentContact) =>
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
      const cityA = locale === 'ar' ? a.cityAr : a.cityEn;
      const cityB = locale === 'ar' ? b.cityAr : b.cityEn;
      // No city sorts last — a city-less agent belongs under the country but
      // not ahead of agents a visitor can geographically place.
      if (cityA === null && cityB !== null) return 1;
      if (cityA !== null && cityB === null) return -1;
      const byCity =
        cityA === null || cityB === null ? 0 : collator.compare(cityA, cityB);
      if (byCity !== 0) return byCity;
      // No name/sortOrder field exists (reported in Stage 37a): within a
      // group the country is shared, so the id is the only meaningful,
      // deterministic tiebreak.
      return compareIds(a, b);
    });
  }

  return [...groups.values()].sort((a, b) =>
    collator.compare(localized(a.agents[0]), localized(b.agents[0]))
  );
}

/** createdAt is not carried to the public layer; the id keeps ties stable. */
function compareIds(a: AgentContact, b: AgentContact): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every agent, grouped for the /agents page.
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
