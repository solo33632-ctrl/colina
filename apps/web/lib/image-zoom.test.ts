import { describe, expect, it } from 'vitest';

import {
  containGeometry,
  contentBox,
  lensSize,
  lensStyle,
  MAX_LENS_SIZE,
  translatePoint,
} from './image-zoom';

// The container here is the frame's CONTENT box — the frame less its padding —
// because that is the box the photo is letterboxed into.
const CONTAINER = { width: 800, height: 450 }; // 16:9 content area
const SQUARE = { width: 1000, height: 1000 }; // letterboxes left and right
const MATCHING = { width: 1600, height: 900 }; // letterboxes not at all
const PANORAMA = { width: 2000, height: 800 }; // letterboxes top and bottom
const TALL = { width: 600, height: 1800 }; // letterboxes hard on both sides

// `contain` never paints the photo larger than the box, so the lens is capped
// by the PHOTO's own axes — see the TALL case, where a 150px-wide picture in a
// 450px-tall box limits the lens to 150.
const LENS = lensSize(CONTAINER);
const CENTRE = LENS / 2;

describe('containGeometry', () => {
  it('scales to fit and centres the overflow axis', () => {
    expect(containGeometry(CONTAINER, SQUARE)).toEqual({
      rendered: { width: 450, height: 450 },
      offset: { x: 175, y: 0 },
    });
  });

  it('letterboxes top and bottom for an image wider than the box', () => {
    expect(containGeometry(CONTAINER, PANORAMA)).toEqual({
      rendered: { width: 800, height: 320 },
      offset: { x: 0, y: 65 },
    });
  });

  it('leaves a matching aspect ratio untouched', () => {
    expect(containGeometry(CONTAINER, MATCHING)).toEqual({
      rendered: { width: 800, height: 450 },
      offset: { x: 0, y: 0 },
    });
  });

  it('scales by the limiting axis for a very tall image', () => {
    expect(containGeometry(CONTAINER, TALL)).toEqual({
      rendered: { width: 150, height: 450 },
      offset: { x: 325, y: 0 },
    });
  });
});

describe('contentBox', () => {
  it('subtracts all four insets from the box', () => {
    expect(
      contentBox(
        { width: 800, height: 450 },
        { top: 24, right: 16, bottom: 24, left: 16 }
      )
    ).toEqual({ width: 768, height: 402 });
  });

  it('is the box itself when there is no padding', () => {
    expect(
      contentBox(CONTAINER, { top: 0, right: 0, bottom: 0, left: 0 })
    ).toEqual(CONTAINER);
  });
});

describe('translatePoint', () => {
  it('moves a point by a delta, in both directions', () => {
    expect(translatePoint({ x: 100, y: 50 }, -16, -24)).toEqual({
      x: 84,
      y: 26,
    });
    expect(translatePoint({ x: 84, y: 26 }, 16, 24)).toEqual({
      x: 100,
      y: 50,
    });
  });
});

describe('lensSize', () => {
  it('caps the lens so it stays smaller than the hero', () => {
    expect(lensSize({ width: 1200, height: 800 })).toBe(MAX_LENS_SIZE);
  });

  it('never exceeds the smaller container axis', () => {
    expect(lensSize({ width: 320, height: 180 })).toBe(180);
  });
});

describe('lensStyle', () => {
  it('centres the cursor in the lens', () => {
    const style = lensStyle({
      container: CONTAINER,
      natural: MATCHING,
      cursor: { x: 400, y: 225 },
      zoom: 2.5,
    });

    expect(style.size).toBe(LENS);
    expect(style.overPhoto).toBe(true);
    expect(style.offset).toEqual({ x: 270, y: 95 });
    expect(style.backgroundSize).toBe('2000px 1125px');
    // The content box maps 1:1 onto the photo, so the cursor at 400/225 sits
    // at 1000/562.5 in the 2.5x-scaled photo, which is 130px (the lens
    // centre) from where the photo is drawn.
    expect(style.backgroundPosition).toBe('-870px -432.5px');
  });

  it('slides the background in the opposite direction to the cursor', () => {
    const at = (x: number) =>
      lensStyle({
        container: CONTAINER,
        natural: MATCHING,
        cursor: { x, y: 225 },
        zoom: 2,
      }).backgroundPosition;

    expect(at(0)).toBe('130px -320px');
    expect(at(800)).toBe('-1470px -320px');
  });

  it('compensates for a letterbox so the lens matches what is on screen', () => {
    // A square photo in a 16:9 box is painted 450x450 with 175px bars down
    // each side. Measuring from the frame instead of the photo would magnify
    // the bar: the cursor at x=400 is 225px into the picture, not 400.
    const style = (y: number) =>
      lensStyle({
        container: CONTAINER,
        natural: SQUARE,
        cursor: { x: 400, y },
        zoom: 2,
      });

    expect(style(0).backgroundSize).toBe('900px 900px');
    // 130 (centre) - (400 - 175) * 2 => -320 across; the cursor at the photo's
    // very top is 130 from the pane's own top edge.
    expect(style(0).backgroundPosition).toBe('-320px 130px');
    expect(style(225).backgroundPosition).toBe('-320px -320px');
  });

  it('reports a letterbox bar as "not over the photo" and clamps onto it', () => {
    // Hovering the grey bar beside a square photo: there is nothing to magnify,
    // so `overPhoto` is false, and the pane is pinned to the photo's near edge
    // instead of floating out in the bar.
    const left = lensStyle({
      container: CONTAINER,
      natural: SQUARE,
      cursor: { x: 20, y: 225 },
      zoom: 2,
    });
    expect(left.overPhoto).toBe(false);
    // The photo starts at x=175 and the pane is 260 wide, so it cannot start
    // before 175.
    expect(left.offset.x).toBe(175);

    // Same for the bar above a panorama.
    const top = lensStyle({
      container: CONTAINER,
      natural: PANORAMA,
      cursor: { x: 400, y: 10 },
      zoom: 2,
    });
    expect(top.overPhoto).toBe(false);
    expect(top.offset.y).toBe(65);
  });

  it('keeps the lens inside the photo on both axes', () => {
    const at = (x: number, y: number) =>
      lensStyle({
        container: CONTAINER,
        natural: MATCHING,
        cursor: { x, y },
        zoom: 2,
      }).offset;

    expect(at(0, 0)).toEqual({ x: 0, y: 0 });
    expect(at(800, 450)).toEqual({ x: 540, y: 190 });
  });

  it('caps the lens by the photo, not the frame', () => {
    // A 600x1800 photo paints 150x450 in the box: the 150px width is what
    // limits the lens, even though the frame is 800 wide.
    const style = lensStyle({
      container: CONTAINER,
      natural: TALL,
      cursor: { x: 400, y: 225 },
      zoom: 2,
    });

    expect(style.size).toBe(150);
    // Centred on the 150px-wide picture, which sits at x=325..475.
    expect(style.offset).toEqual({ x: 325, y: 150 });
  });

  it('centres the lens when it is larger than the container axis', () => {
    const style = lensStyle({
      container: { width: 100, height: 100 },
      natural: SQUARE,
      cursor: { x: 10, y: 10 },
      zoom: 2,
    });

    expect(style.size).toBe(100);
    expect(style.offset).toEqual({ x: 0, y: 0 });
  });

  it('produces a scaled photo that always covers the lens', () => {
    // Otherwise the pane would show empty space beside the photo's edges. With
    // `contain` this holds because the lens is capped by the photo's own axes,
    // so any zoom of 1 or more covers it.
    for (const natural of [MATCHING, SQUARE, PANORAMA, TALL]) {
      const style = lensStyle({
        container: CONTAINER,
        natural,
        cursor: { x: 400, y: 225 },
        zoom: 1.5,
      });
      const [width, height] = style.backgroundSize
        .split(' ')
        .map((value) => Number.parseFloat(value));
      expect(width).toBeGreaterThanOrEqual(style.size);
      expect(height).toBeGreaterThanOrEqual(style.size);
    }
  });

  it('has no left/right bias, so RTL and LTR magnify identically', () => {
    // Mirrored cursors must mirror the background exactly. The function
    // takes no direction input and the component positions the pane with
    // physical `left`/`top` offsets, so the ar and en builds cannot differ.
    const at = (x: number) =>
      Number.parseFloat(
        lensStyle({
          container: CONTAINER,
          natural: MATCHING,
          cursor: { x, y: 225 },
          zoom: 2.5,
        }).backgroundPosition
      );

    for (const x of [0, 100, 400, 700, 800]) {
      expect(at(x) + at(CONTAINER.width - x)).toBeCloseTo(
        2 * CENTRE - CONTAINER.width * 2.5,
        5
      );
    }
  });

  it('stays symmetric for a letterboxed photo too', () => {
    // The same no-bias guarantee has to hold when the photo does not fill the
    // box, since that is the case the gallery actually renders.
    const at = (x: number) =>
      Number.parseFloat(
        lensStyle({
          container: CONTAINER,
          natural: SQUARE,
          cursor: { x, y: 225 },
          zoom: 2,
        }).backgroundPosition
      );

    // Mirrored points sum to `2 * centre - painted width * zoom`, exactly as for
    // a photo that fills the box: 2 * 130 - 450 * 2 = -640.
    expect(at(175) + at(625)).toBeCloseTo(2 * CENTRE - 450 * 2, 5);
  });
});
