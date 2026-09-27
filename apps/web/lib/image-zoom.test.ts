import { describe, expect, it } from 'vitest';

import {
  coverGeometry,
  lensSize,
  lensStyle,
  MAX_LENS_SIZE,
} from './image-zoom';

const CONTAINER = { width: 800, height: 450 }; // 16:9, the hero frame
const SQUARE = { width: 1000, height: 1000 }; // crops top and bottom
const MATCHING = { width: 1600, height: 900 }; // crops nothing
const PANORAMA = { width: 2000, height: 800 }; // crops left and right
const TALL = { width: 600, height: 1800 }; // crops top and bottom hard

// `cover` always paints the image at least as large as the container on
// both axes, so the scaled image is guaranteed to cover the whole lens.
const LENS = lensSize(CONTAINER);
const CENTRE = LENS / 2;

describe('coverGeometry', () => {
  it('scales to cover and centres the overflow axis', () => {
    expect(coverGeometry(CONTAINER, SQUARE)).toEqual({
      rendered: { width: 800, height: 800 },
      offset: { x: 0, y: -175 },
    });
  });

  it('crops left and right for an image wider than the box', () => {
    expect(coverGeometry(CONTAINER, PANORAMA)).toEqual({
      rendered: { width: 1125, height: 450 },
      offset: { x: -162.5, y: 0 },
    });
  });

  it('leaves a matching aspect ratio untouched', () => {
    expect(coverGeometry(CONTAINER, MATCHING)).toEqual({
      rendered: { width: 800, height: 450 },
      offset: { x: 0, y: 0 },
    });
  });

  it('scales by the overflowing axis for a very tall image', () => {
    expect(coverGeometry(CONTAINER, TALL)).toEqual({
      rendered: { width: 800, height: 2400 },
      offset: { x: 0, y: -975 },
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
    expect(style.offset).toEqual({ x: 270, y: 95 });
    expect(style.backgroundSize).toBe('2000px 1125px');
    // The container maps 1:1 onto the image, so the cursor at 400/225 sits
    // at 1000/562.5 in the 2.5x-scaled image, which is 130px (the lens
    // centre) from where the image is drawn.
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

  it('compensates for a cover crop so the lens matches what is on screen', () => {
    // A square image in a 16:9 box loses 175px off the top and bottom at
    // 1x. Without adding that back, hovering the top edge would magnify a
    // part of the image the visitor cannot see.
    const style = (y: number) =>
      lensStyle({
        container: CONTAINER,
        natural: SQUARE,
        cursor: { x: 400, y },
        zoom: 2,
      });

    expect(style(0).backgroundSize).toBe('1600px 1600px');
    // Top of the box shows image row 175, i.e. row 350 once scaled.
    expect(style(0).backgroundPosition).toBe('-670px -220px');
    expect(style(225).backgroundPosition).toBe('-670px -670px');
  });

  it('keeps the lens inside the image on both axes', () => {
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

  it('produces a scaled image that always covers the lens', () => {
    // Otherwise the pane would show empty space next to the crop edges.
    for (const natural of [MATCHING, SQUARE, PANORAMA, TALL]) {
      const style = lensStyle({
        container: CONTAINER,
        natural,
        cursor: { x: 0, y: 0 },
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
});
