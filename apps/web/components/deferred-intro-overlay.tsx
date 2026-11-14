'use client';

import dynamic from 'next/dynamic';
import { useIntro } from './intro-provider';

// The splash is a once-per-session moment on the home page only. Its own chunk
// is fetched after the provider has decided this visit will actually play it,
// so repeat visits and reduced-motion visitors never download it. Waiting for
// the phase also means the page beneath paints first, which is the point: the
// overlay is a layer over the hero, never a gate in front of the first paint.
const IntroOverlay = dynamic(
  () => import('./intro-overlay').then((module) => module.IntroOverlay),
  { ssr: false }
);

export function DeferredIntroOverlay() {
  const { phase } = useIntro();

  if (phase !== 'playing') return null;

  return <IntroOverlay />;
}
