'use client';

import { useEffect, useRef } from 'react';

// Sends one anonymous page view per page the visitor actually opens.
//
// WHY A BEACON IN THE CLIENT, NOT A CALL IN THE SERVER COMPONENT:
// every public page is prerendered (`revalidate = 3600`, and `●` in the build
// output), so a Server Component's body runs at build time and then once per
// revalidation window — roughly one execution an hour, not one per visit.
// Counting from there would produce a table of render events, not of traffic.
// Reading the User-Agent with `headers()` would force the route dynamic and
// fix the counting, at the price of losing static HTML on nine pages. This
// component keeps the pages exactly as fast as they were (still served as
// static HTML) and still counts every visit.
//
// WHAT IT SENDS: the page's own path and the active locale — two strings the
// page already knows, passed in explicitly rather than derived from the URL,
// so `/ar/privacy` and `/en/privacy` report the same locale-agnostic "/privacy".
// No cookie, no identifier, no storage, no third-party request: the endpoint
// can only store an aggregate counter (see app/api/page-view/route.ts).
//
// WHY sendBeacon: the request must not keep the page alive, and it must
// survive the visitor clicking the next link immediately. `fetch` with
// `keepalive` is the fallback for the rare browser without it.
type PageViewTrackerProps = {
  path: string;
  locale: string;
};

export function PageViewTracker({ path, locale }: PageViewTrackerProps) {
  // Guards against React's development-mode double effect (StrictMode mounts,
  // unmounts and remounts every component), which would otherwise count one
  // visit twice in dev and make local numbers disagree with production.
  const alreadySent = useRef(false);

  useEffect(() => {
    if (alreadySent.current) {
      return;
    }
    alreadySent.current = true;

    const body = JSON.stringify({ path, locale });
    const beaconSent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(
        '/api/page-view',
        new Blob([body], { type: 'application/json' })
      );
    if (!beaconSent) {
      void fetch('/api/page-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Nothing to do: a view that cannot be reported is not worth telling
        // the visitor about, and the response is never read.
      });
    }
  }, [path, locale]);

  return null;
}
