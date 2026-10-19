import { describe, expect, it } from 'vitest';
import {
  COARSE_STEP,
  DEFAULT_POSITION,
  MAX_POSITION,
  MIN_POSITION,
  STEP,
  clamp,
  clampPosition,
  keyToPosition,
  pointerToPercent,
} from './before-after';

describe('clamp', () => {
  it('leaves a value inside the range alone', () => {
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });

  it('pulls a value outside the range to the nearest edge', () => {
    expect(clamp(-0.001, 0, 100)).toBe(0);
    expect(clamp(-40, 0, 100)).toBe(0);
    expect(clamp(100.001, 0, 100)).toBe(100);
    expect(clamp(9999, 0, 100)).toBe(100);
  });

  it('answers with the minimum rather than NaN', () => {
    // A non-numeric position must never reach the style: NaN in a clip-path
    // makes the browser drop the whole declaration and the AFTER image shows
    // un-clipped over the whole frame.
    expect(clamp(Number.NaN, 0, 100)).toBe(0);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 100)).toBe(100);
    expect(clamp(Number.NEGATIVE_INFINITY, 0, 100)).toBe(0);
  });

  it('is the slider range by default', () => {
    expect(clampPosition(-1)).toBe(MIN_POSITION);
    expect(clampPosition(101)).toBe(MAX_POSITION);
    expect(clampPosition(50)).toBe(50);
  });
});

describe('pointerToPercent', () => {
  const rect = { left: 100, width: 400 };

  it('maps the box edges to 0 and 100', () => {
    expect(pointerToPercent(100, rect)).toBe(0);
    expect(pointerToPercent(500, rect)).toBe(100);
  });

  it('maps the middle to 50', () => {
    expect(pointerToPercent(300, rect)).toBe(50);
    expect(pointerToPercent(200, rect)).toBe(25);
    expect(pointerToPercent(400, rect)).toBe(75);
  });

  it('clamps a pointer that has left the box', () => {
    // The whole reason the pointer can be dragged past either edge without the
    // divider escaping its own frame.
    expect(pointerToPercent(-250, rect)).toBe(0);
    expect(pointerToPercent(0, rect)).toBe(0);
    expect(pointerToPercent(900, rect)).toBe(100);
    expect(pointerToPercent(100_000, rect)).toBe(100);
  });

  it('honours a box that is not at the viewport origin', () => {
    expect(pointerToPercent(1000, { left: 800, width: 200 })).toBe(100);
    expect(pointerToPercent(900, { left: 800, width: 200 })).toBe(50);
    expect(pointerToPercent(850, { left: 800, width: 200 })).toBe(25);
  });

  it('rounds to a whole percent', () => {
    // A tap at "30%" of a box whose rect has a fractional width is really
    // 30.000000426223156, and that is what would reach aria-valuenow and the
    // clip-path if it were not rounded here.
    const fractional = { left: 0, width: 235.49999618530273 };
    expect(pointerToPercent(fractional.width * 0.3, fractional)).toBe(30);
    expect(pointerToPercent(0.499999, { left: 0, width: 1.0000001 })).toBe(50);
    for (const url of [rect.left, rect.left + rect.width]) {
      expect(Number.isInteger(pointerToPercent(url, rect))).toBe(true);
    }
  });

  it('falls back to the centre for a box with no width', () => {
    // display:none, or a rect read before layout. Dividing by zero here would
    // be NaN, and NaN in a clip-path silently drops the clip.
    expect(pointerToPercent(300, { left: 0, width: 0 })).toBe(DEFAULT_POSITION);
    expect(pointerToPercent(300, { left: 0, width: -10 })).toBe(
      DEFAULT_POSITION
    );
  });
});

describe('keyToPosition', () => {
  const at = (key: string, current: number, shift = false) => {
    const result = keyToPosition(key, current, shift);
    if (result.type !== 'set') {
      throw new Error(`expected ${key} to move the divider`);
    }
    return result.position;
  };

  it('moves by one step per arrow press', () => {
    expect(STEP).toBe(5);
    expect(at('ArrowRight', 50)).toBe(55);
    expect(at('ArrowLeft', 50)).toBe(45);
  });

  it('moves by the coarse step with Shift held', () => {
    expect(COARSE_STEP).toBe(20);
    expect(at('ArrowRight', 50, true)).toBe(70);
    expect(at('ArrowLeft', 50, true)).toBe(30);
  });

  it('sends Home and End to the two edges', () => {
    expect(at('Home', 73)).toBe(MIN_POSITION);
    expect(at('End', 27)).toBe(MAX_POSITION);
    // Shift must not change them.
    expect(at('Home', 73, true)).toBe(MIN_POSITION);
    expect(at('End', 27, true)).toBe(MAX_POSITION);
  });

  it('never moves past either edge', () => {
    expect(at('ArrowLeft', 3)).toBe(0);
    expect(at('ArrowLeft', 0)).toBe(0);
    expect(at('ArrowRight', 97)).toBe(100);
    expect(at('ArrowRight', 100)).toBe(100);
    expect(at('ArrowLeft', 10, true)).toBe(0);
    expect(at('ArrowRight', 90, true)).toBe(100);
  });

  it('moves the line physically left for ArrowLeft and right for ArrowRight', () => {
    // The one rule that has to hold in Arabic as well: these are screen
    // directions, not text directions, so they must not be mirrored.
    expect(at('ArrowLeft', 50)).toBeLessThan(50);
    expect(at('ArrowRight', 50)).toBeGreaterThan(50);
  });

  it('ignores every key it does not own', () => {
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'Enter',
      ' ',
      'Escape',
      'Tab',
      'a',
    ]) {
      expect(keyToPosition(key, 50), key).toEqual({ type: 'none' });
      expect(keyToPosition(key, 50, true), key).toEqual({ type: 'none' });
    }
  });
});
