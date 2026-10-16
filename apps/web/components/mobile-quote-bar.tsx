'use client';

import { useEffect, useState } from 'react';
import { Button, Container } from '@colina/ui';

/**
 * The summary block's "Request a quote" button, on the page below.
 *
 * A stable id, because that button's on-screen state is what decides whether the
 * bar is wanted at all (see the effect below). The observer keys off this id
 * rather than off a ref handed down from the page: the button and the bar are
 * hundreds of DOM nodes apart and there is no parent that owns both.
 */
const CTA_ID = 'quote-cta';

/** The section the bar links to — the form itself. */
const TARGET_ID = 'quote';

type MobileQuoteBarProps = {
  /**
   * The button's label, already localized.
   *
   * Passed in from the server page (`t('requestQuote')`) rather than read here
   * with `useTranslations`: the machine page already holds the translation, and
   * threading the string keeps this component free of namespace knowledge and
   * of any new message keys. It stays a Server Component boundary-safe prop
   * because the value is a plain string.
   */
  label: string;
};

/**
 * A one-tap way back to the quote form, for phones only.
 *
 * A machine page is long — photo, summary, details, form — and on a 390px screen
 * the visitor has usually scrolled well past the summary button before they are
 * ready to decide anything, at which point the one button that matters is off the
 * top of the screen. This bar restores it.
 *
 * **When it is shown** is the whole design. It appears only in the window
 * BETWEEN the summary button and the form:
 *
 *   - the summary button is on screen  -> hidden (the real button is right there;
 *     two copies of the same call to action would be noise);
 *   - the form is on screen             -> hidden, and this is the hard rule: a
 *     bar over the fields would cover what it is pointing at, and would sit on
 *     top of the submit button on the very form it exists to reach;
 *   - between them                      -> shown, while the visitor reads.
 *
 * Both states come from ONE `IntersectionObserver` over both elements, so the
 * decision is derived rather than accumulated: no scroll listener, no throttling,
 * no stale flag to reconcile, and the browser computes it off the main thread
 * where it already tracks scrolling for `position: sticky`.
 *
 * **It renders hidden on the server and stays hidden on the first client paint.**
 * The initial state is `false` and nothing in the first render reads the viewport,
 * so there is no flash of a bar over a page that has not scrolled yet and no
 * hydration mismatch between the server HTML and the first client render. The
 * effect that can only run after mount is the one thing allowed to change it.
 *
 * **Hidden means hidden, not merely transparent.** `visibility: hidden` takes the
 * bar out of painting and out of the accessibility tree; `inert` takes it out of
 * the tab order; `pointer-events-none` stops a stray tap on an invisible
 * rectangle. Opacity alone would leave a full-width invisible link sitting over
 * the footer links at the bottom of the page — focusable, clickable, and
 * reported as on-screen by anything that only checks the box.
 *
 * **Reduced motion** gets no transition at all: the transform is gated behind
 * `motion-safe:` rather than neutralized with `motion-reduce:`, so under
 * `prefers-reduced-motion: reduce` there is no transform to animate and the bar
 * simply appears and disappears.
 */
export function MobileQuoteBar({ label }: MobileQuoteBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const cta = document.getElementById(CTA_ID);
    const target = document.getElementById(TARGET_ID);
    // Nothing to watch means nothing to promise. A bar that cannot tell where the
    // form is would cover it, which is the one thing it must never do.
    if (!cta || !target) {
      return;
    }

    let ctaInView = false;
    let formInView = false;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === cta) ctaInView = entry.isIntersecting;
        else if (entry.target === target) formInView = entry.isIntersecting;
      }
      // Read both AFTER the loop: the callback can carry an entry for each
      // element, in either order, and deciding from a half-updated pair would
      // show the bar for a frame at the exact moment the form arrives.
      setVisible(!ctaInView && !formInView);
    });

    observer.observe(cta);
    observer.observe(target);

    // Disconnect rather than relying on GC: the callback closes over React state
    // and the observer keeps its targets alive until it is disconnected.
    return () => observer.disconnect();
  }, []);

  return (
    <div
      data-testid="mobile-quote-bar"
      aria-hidden={!visible}
      inert={!visible}
      className={[
        // Phones only. `hidden` is `display: none`, so on desktop the bar is
        // gone from the layout, the paint and the accessibility tree alike.
        'lg:hidden',
        // `z-40`, below the home page's `z-50` intro backdrop and above the
        // page. The gallery lightbox is a native <dialog> in the top layer, so
        // it covers the bar whatever this number is.
        'fixed inset-x-0 bottom-0 z-40',
        'border-t border-stone-200 bg-white',
        'shadow-[0_-2px_10px_rgb(0_0_0/0.07)]',
        // The safe-area inset keeps the button clear of the home indicator on a
        // notched phone; without it the label sits under the gesture bar. With
        // its 1px top border the bar measures 73px; globals.css reserves 5rem
        // for it under the footer, which is that height plus a hair of slack.
        'pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom,0px))]',
        // `visibility` is in the transition property list on purpose. It is a
        // discrete property, so CSS holds it at the starting value for the
        // whole 300ms and flips it only at the end — which is what lets the bar
        // fade out on the way down instead of blinking out of existence. Under
        // reduced motion there is no transition, so it simply flips.
        'motion-safe:transition-[opacity,transform,visibility] motion-safe:duration-300 motion-safe:ease-out',
        // Both states carry a `motion-safe:` transform so the transition always
        // has two values to interpolate between. Under reduced motion none of
        // these apply, there is no transform, and show/hide is instant.
        //
        // `invisible`, not just `opacity: 0`: an element at zero opacity still
        // has a box, is still hit-testable by anything that ignores
        // `pointer-events`, and is still "visible" to assistive tech and to any
        // tool that asks whether it is on screen. Three attributes together —
        // `invisible`, `pointer-events-none` and `inert` — mean the hidden state
        // is absent rather than merely faint.
        visible
          ? 'visible opacity-100 motion-safe:translate-y-0'
          : 'invisible pointer-events-none opacity-0 motion-safe:translate-y-full',
      ].join(' ')}
    >
      {/* `Container`, not a bare full-bleed button: the bar's button then lines
          up with the page's own left and right edges at every width the bar
          exists at. Full width, no physical left/right, so RTL is identical. */}
      <Container>
        <Button href={`#${TARGET_ID}`} size="lg" className="w-full">
          {label}
        </Button>
      </Container>
    </div>
  );
}
