/**
 * Pure maths for the before/after comparison slider.
 *
 * Kept out of the component because these are the three decisions the slider
 * gets wrong most easily, and each is testable on its own: a position that
 * escapes its range, a pointer that lands outside the box, and a keypress that
 * is meant to move the divider physically left in an Arabic page as well as an
 * English one.
 */

/** Lowest and highest the divider can sit, as a percentage from the left. */
export const MIN_POSITION = 0;
export const MAX_POSITION = 100;

/** Default: the two halves are the same size until the visitor moves it. */
export const DEFAULT_POSITION = 50;

/** One plain arrow press. */
export const STEP = 5;

/** One Shift+arrow press — a coarse jump for crossing the frame. */
export const COARSE_STEP = 20;

/**
 * Holds a position inside `[min, max]`.
 *
 * Clamping is not a nicety: the value comes from pointer coordinates, and a
 * pointer that leaves the element mid-drag would otherwise park the divider
 * outside its own box, where the clip-path would hide one image entirely and
 * the handle would sit where it cannot be grabbed again.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** `clamp`, spelled for this component's range. */
export function clampPosition(value: number): number {
  return clamp(value, MIN_POSITION, MAX_POSITION);
}

/**
 * Where in the box a pointer is, as a percentage from the left.
 *
 * `clientX` is viewport-relative, so it is converted through the element's own
 * rectangle; `width` is that rectangle's width. A zero or negative width (the
 * element is display:none, or the rect has not been laid out) has no meaningful
 * midpoint, so the answer is the centre rather than a division by zero.
 *
 * The result is clamped, which is what makes a drag that continues past either
 * edge sit against that edge instead of overshooting it.
 *
 * ROUNDED to a whole percent. A pointer never lands on a round number —
 * `getBoundingClientRect()` returns fractional widths, so a tap at "30%" is
 * really 30.000000426223156 — and that value ends up in `aria-valuenow`, in the
 * `valueText` a screen reader reads out, and in the clip-path itself. Reporting
 * seventeen decimal places is noise in all three, so the position is rounded
 * once, here, and every consumer downstream gets a clean number.
 */
export function pointerToPercent(
  clientX: number,
  rect: { left: number; width: number }
): number {
  if (rect.width <= 0) {
    return DEFAULT_POSITION;
  }
  return clampPosition(
    Math.round(((clientX - rect.left) / rect.width) * MAX_POSITION)
  );
}

/** The key result the slider acts on. */
export type SliderKeyAction =
  | { type: 'set'; position: number }
  | { type: 'none' };

/**
 * Maps a keypress to a new position, or to `none` when the key is not ours.
 *
 * Deliberately physical, not logical: `ArrowLeft` lowers the number, which
 * moves the divider towards the left edge of the screen. In an Arabic page the
 * document runs right to left, but the divider is a comparison of two
 * photographs and "before" is on the left in both languages — so the arrow
 * keys move the line the same way in both, and only the labels change. (The
 * component pins `dir="ltr"` for the same reason.)
 */
export function keyToPosition(
  key: string,
  current: number,
  shiftKey = false
): SliderKeyAction {
  const step = shiftKey ? COARSE_STEP : STEP;

  switch (key) {
    case 'ArrowLeft':
      return { type: 'set', position: clampPosition(current - step) };
    case 'ArrowRight':
      return { type: 'set', position: clampPosition(current + step) };
    case 'Home':
      return { type: 'set', position: MIN_POSITION };
    case 'End':
      return { type: 'set', position: MAX_POSITION };
    default:
      return { type: 'none' };
  }
}
