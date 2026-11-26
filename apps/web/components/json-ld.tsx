import { serializeJsonLd } from '@/lib/seo';

/**
 * The one way structured data reaches a page.
 *
 * All JSON-LD goes through `serializeJsonLd`, which escapes the characters
 * that could otherwise end the script element or break the surrounding HTML.
 * Rendering the script here rather than at each call site is what guarantees
 * no page can reintroduce a raw `JSON.stringify` and reopen the injection
 * path.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
