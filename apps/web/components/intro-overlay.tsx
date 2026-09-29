'use client';

import Image from 'next/image';
import type { AnimationEvent } from 'react';
import { Container } from '@colina/ui';
import { finishIntro } from '@/lib/intro-store';
import { useIntro } from './intro-provider';
import { LOGO_SIZES } from '@/lib/intro';

// Same intrinsic size and the same shared `sizes` as the header lockup, so the
// two <img> elements resolve to an identical /_next/image URL and the browser
// fetches the file once for the whole page. See LOGO_SIZES.
const LOGO_WIDTH = 773;
const LOGO_HEIGHT = 534;

/**
 * The full-viewport brand moment on the home page's first visit of a session.
 *
 * It is a layer, never a gate: the hero, the data behind it and the rest of
 * the page are all server-rendered underneath before this mounts, `inert`
 * keeps it out of the tab order, and `pointer-events-none` means a click
 * reaches the page even mid-animation.
 *
 * The backdrop starts at `opacity: 0` in its keyframes, so a browser without
 * JS — or a session that has already been marked — never ends up with a white
 * sheet parked over the content.
 */
export function IntroOverlay() {
  const { phase } = useIntro();

  if (phase !== 'playing') return null;

  // Only the backdrop's own animation marks the end. The children finish
  // earlier, and their events bubble up to here, so they are filtered out.
  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    finishIntro();
  };

  return (
    <div
      // aria-hidden: the logo repeats the header's own link a few hundred
      // milliseconds later, so announcing it would be a duplicate.
      aria-hidden="true"
      inert
      data-testid="intro-overlay"
      onAnimationEnd={onAnimationEnd}
      className="colina-intro-backdrop pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white"
    >
      <Container className="flex flex-col items-center">
        <Image
          src="/logo.png"
          // Decorative: the whole overlay is aria-hidden, and the header lockup
          // directly below it is the accessible name for the brand.
          alt=""
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          sizes={LOGO_SIZES}
          className="colina-intro-mark h-28 w-auto sm:h-40"
        />
        {/* A hairline in the measured brand orange, echoing the rule under the
            hero. Purely decorative. */}
        <div className="colina-intro-rule mt-6 h-0.5 w-24 rounded-full bg-brand-500" />
      </Container>
    </div>
  );
}
