import { NextResponse } from 'next/server';
import { recordPageView } from '@colina/db';
import { isCrawlerUserAgent, pageViewInputSchema } from '@/lib/page-views';
import {
  getClientIp,
  PAGE_VIEW_RATE_LIMIT,
  rateLimitCheck,
} from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/request-origin';

// Page-view counter (Phase 21b).
//
// The write happens HERE, in a Node route handler, and not in each page's
// Server Component — see `PageViewTracker` for why. Same runtime as every other
// Prisma read/write in this project, so the `pg` driver behind
// @prisma/adapter-pg has the real TCP socket it needs; `proxy.ts` runs on the
// Edge runtime, where a database write would fail or silently no-op.
//
// The endpoint is first-party and anonymous by construction: it stores a path
// and a locale against a date and nothing else. There is no cookie, no
// identifier and no per-visitor row, so the privacy policy's claim has no way
// to be quietly untrue.
//
// Generic English error codes for the API contract, like the other two routes.
// The tracker never reads this response, so there is no translated string here.

// This endpoint's rate-limiter bucket. Never stored: there is deliberately no
// `source` naming for page views in SecurityEvent (see rate-limit.ts).
const BUCKET = 'page-view';

export async function POST(req: Request) {
  // Crawlers first: the check reads no state, writes nothing and costs no
  // database round trip, so a bot is answered before it can spend a
  // rate-limit slot or touch the pool. Answered 204 rather than an error so a
  // bot cannot tell it was filtered. A missing User-Agent counts as a crawler
  // (every real browser sends one).
  if (isCrawlerUserAgent(req.headers.get('user-agent'))) {
    return new NextResponse(null, { status: 204 });
  }

  // Same-origin: without this, any third-party page could POST arbitrary
  // paths into our counters. Shared with the two lead-form routes.
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: 'bad_origin' },
      { status: 400 }
    );
  }

  // Every public POST endpoint is rate-limited (agent.md). A refused request is
  // simply not counted — no row, no security event.
  const retryAfter = rateLimitCheck(
    `${BUCKET}:${getClientIp(req)}`,
    PAGE_VIEW_RATE_LIMIT
  );
  if (retryAfter > 0) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 }
    );
  }

  // Validated server-side like every other input here: the page that sent this
  // payload is not trusted, and only a known public path in a known locale
  // gets stored.
  const parsed = pageViewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_input' },
      { status: 400 }
    );
  }

  // Awaited deliberately, though the caller ignores the result and the writer
  // can never throw. This request is not the page load — the browser fired it
  // after the page was already rendered and interactive — so nothing waits on
  // the insert except this endpoint's own 204. Not awaiting would be the
  // "fire-and-forget" shape, but a promise the runtime is free to freeze the
  // moment the response is sent (serverless) can silently drop views, and a
  // count that is sometimes missing is worse than one that is a millisecond
  // late. The write itself is best-effort: `recordPageView` swallows any
  // failure and reports 'skipped'.
  await recordPageView(parsed.data.path, parsed.data.locale);

  return new NextResponse(null, { status: 204 });
}
