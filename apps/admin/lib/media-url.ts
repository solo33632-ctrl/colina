import { z } from './zod';

// Stage 4c: the one place that decides whether a stored media URL is allowed.
//
// An editor is a lower-trust account: pasting an arbitrary external URL into a
// machine/category image (or calling the Server Action directly) would let the
// public site render third-party content under Colina's name. A media URL is
// therefore accepted only when it is an https URL delivered by the project's
// own Cloudinary account:
//
//   https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/...
//
// Everything else — another host, another cloud, plain http, data:, javascript:,
// embedded credentials, a lookalike host, a port, a query/fragment trick or an
// overlong value — is refused. The message passed by callers stays generic: no
// error names the expected host or cloud.
//
// Backward compatibility is deliberately NOT decided here: `mediaUrlSchema`
// takes the value that is already stored, and an exact match is accepted even
// when it could never pass today (seed paths under `/images/seed/`, older
// external URLs). Callers in the update actions load the row first and pass
// that stored value; create actions pass nothing.

/** Practical ceiling for a stored media URL (the browser/crawler limit). */
export const MEDIA_URL_MAX_LENGTH = 2048;

/**
 * The configured Cloudinary cloud, read at call time. `uploadBuffer` already
 * uses the same variable. Missing configuration fails closed: with no known
 * cloud there is no URL that can be proved to belong to the project.
 */
export function mediaCloudName(): string | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  return cloud ? cloud : null;
}

/** True only for an https Cloudinary URL under the configured cloud. */
export function isAllowedMediaUrl(value: string): boolean {
  if (value.length === 0 || value.length > MEDIA_URL_MAX_LENGTH) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }
  if (url.hostname !== 'res.cloudinary.com' || url.port !== '') {
    return false;
  }
  // Credentials in the authority would be echoed to the public page.
  if (url.username !== '' || url.password !== '') {
    return false;
  }
  // Delivered Cloudinary URLs carry no query/fragment; refusing both keeps
  // `?`/`#` from becoming a second, unchecked part of the stored value.
  if (url.search !== '' || url.hash !== '') {
    return false;
  }

  const cloud = mediaCloudName();
  if (!cloud) {
    return false;
  }
  return url.pathname.startsWith(`/${cloud}/`);
}

export type MediaUrlOptions = {
  /**
   * On UPDATE only: the exact value already stored. An exact match bypasses
   * the rule so legacy rows stay editable without touching their media.
   */
  unchanged?: string | null;
};

/** Required media URL. Presence is the schema's job; this is the allowlist. */
export function mediaUrlSchema(message: string, options: MediaUrlOptions = {}) {
  return z
    .string()
    .refine(
      (value) => value === options.unchanged || isAllowedMediaUrl(value),
      { error: message }
    );
}

/** Optional media URL: blank/absent keeps its existing "no media" meaning. */
export function optionalMediaUrlSchema(
  message: string,
  options: MediaUrlOptions = {}
) {
  return z
    .string()
    .optional()
    .refine(
      (value) =>
        value === undefined ||
        value === '' ||
        value === options.unchanged ||
        isAllowedMediaUrl(value),
      { error: message }
    );
}

export type MediaFieldRule = {
  /** Form/action field name, e.g. `images.0.url` or `logo`. */
  field: string;
  value: string | undefined;
  message: string;
  optional?: boolean;
  /** The stored value this update must grandfather, when unchanged. */
  unchanged?: string | null;
};

/**
 * Runs the shared rule over several fields and returns the same generic
 * `{ field, message }` shape every Server Action already uses for zod issues.
 */
export function mediaFieldIssues(
  rules: MediaFieldRule[]
): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  for (const rule of rules) {
    const schema = rule.optional
      ? optionalMediaUrlSchema(rule.message, { unchanged: rule.unchanged })
      : mediaUrlSchema(rule.message, { unchanged: rule.unchanged });
    const parsed = schema.safeParse(rule.value);
    if (!parsed.success) {
      issues.push({
        field: rule.field,
        message: parsed.error.issues[0]?.message ?? rule.message,
      });
    }
  }
  return issues;
}
