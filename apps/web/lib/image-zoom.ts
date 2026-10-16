// Pure geometry for the machine-gallery hover magnifier. Kept free of DOM
// and React so the maths is unit-testable (see `image-zoom.test.ts`) and so
// the component only has to measure and assign.
//
// Everything is expressed in physical CSS pixels measured from the container's
// own top-left corner, and the container is the image's CONTENT box — the frame
// less its padding — because that is the box the photo is letterboxed into.
// Nothing here reads the document direction, which is what makes the magnifier
// behave identically in the RTL (ar) and LTR (en) builds: the lens is positioned
// with `left`/`top` offsets and its background is offset with
// `background-position` *lengths*, neither of which is mirrored by
// `direction: rtl`.

/** A width/height pair in CSS pixels. */
export type Size = { width: number; height: number };

/** A point in CSS pixels. */
export type Point = { x: number; y: number };

/** How `object-fit: contain` paints an image inside its container. */
export type ContainGeometry = {
  /** Size the image is painted at inside the container. */
  rendered: Size;
  /**
   * Top-left corner of the painted box relative to the container. Positive on
   * the axes that letterbox, which is the opposite of the `cover` case and the
   * whole reason this module changed.
   */
  offset: Point;
};

/**
 * Reproduces the CSS `object-fit: contain` algorithm: scale the image DOWN
 * until both axes fit, then centre it.
 *
 * The magnifier has to magnify what the visitor actually *sees*. With `contain`
 * that is the whole photo, letterboxed inside the frame, so the lens maths needs
 * the painted size AND the letterbox offset. Ignoring the offset is what made
 * an earlier version magnify the grey bars: the lens treated the frame as if the
 * photo filled it edge to edge, which is true for `cover` and false for
 * `contain`.
 */
export function containGeometry(
  container: Size,
  natural: Size
): ContainGeometry {
  const scale = Math.min(
    container.width / natural.width,
    container.height / natural.height
  );
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    rendered: { width, height },
    offset: {
      x: (container.width - width) / 2,
      y: (container.height - height) / 2,
    },
  };
}

/** Padding around a box, in CSS pixels. */
export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * The area a padded element actually paints its content into.
 *
 * The gallery frame pads its image, and the photo is letterboxed inside THAT
 * box, not inside the frame. The magnifier has to use the same box or every
 * measurement is off by the padding.
 */
export function contentBox(box: Size, insets: Insets): Size {
  return {
    width: box.width - insets.left - insets.right,
    height: box.height - insets.top - insets.bottom,
  };
}

/** Moves a point by a delta — used to convert between box and content coords. */
export function translatePoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

/** Upper bound for the lens, so it stays a lens and not a second hero. */
export const MAX_LENS_SIZE = 260;

/** Below this the lens is too small to be worth showing at all. */
export const MIN_LENS_SIZE = 160;

export function lensSize(container: Size): number {
  return Math.min(MAX_LENS_SIZE, container.width, container.height);
}

/** Keeps the lens fully inside the image instead of hanging off its edge. */
function clampAxis(value: number, min: number, max: number): number {
  // An empty range means the lens is larger than the container on this
  // axis; centre it rather than pinning it to an out-of-bounds edge.
  if (max < min) {
    return (min + max) / 2;
  }
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  // Sub-pixel lens offsets make the background shimmer while tracking the
  // cursor; two decimals is well below a rendered pixel at any DPR.
  return Math.round(value * 100) / 100;
}

export type LensStyle = {
  /** Side length of the square lens pane. */
  size: number;
  /** Lens pane offset inside the photo, so the lens rides the cursor. */
  offset: Point;
  /** `background-size`: the painted photo scaled up by `zoom`. */
  backgroundSize: string;
  /** `background-position`: places `cursor` at the centre of the pane. */
  backgroundPosition: string;
  /**
   * False when the cursor is over a letterbox bar rather than over the photo.
   * There is nothing to magnify there, so the caller hides the lens instead of
   * showing a pane full of grey.
   */
  overPhoto: boolean;
};

export function lensStyle({
  container,
  natural,
  cursor,
  zoom,
}: {
  container: Size;
  natural: Size;
  cursor: Point;
  zoom: number;
}): LensStyle {
  const { rendered, offset } = containGeometry(container, natural);

  // The painted photo's edges in container coordinates.
  const left = offset.x;
  const top = offset.y;
  const right = offset.x + rendered.width;
  const bottom = offset.y + rendered.height;

  const overPhoto =
    cursor.x >= left &&
    cursor.x <= right &&
    cursor.y >= top &&
    cursor.y <= bottom;

  // Clamp the point onto the photo even when the cursor is outside it, so the
  // geometry below is always a real point on the picture rather than an origin
  // in the letterbox.
  const pointX = clampAxis(cursor.x, left, right);
  const pointY = clampAxis(cursor.y, top, bottom);

  // The lens must fit the PHOTO, not just the frame: a narrow panorama
  // letterboxed in a tall frame is the case where the difference shows.
  const size = Math.min(lensSize(container), rendered.width, rendered.height);
  const centre = size / 2;
  return {
    size: round(size),
    overPhoto,
    offset: {
      x: round(clampAxis(pointX - centre, left, right - size)),
      y: round(clampAxis(pointY - centre, top, bottom - size)),
    },
    backgroundSize: `${round(rendered.width * zoom)}px ${round(
      rendered.height * zoom
    )}px`,
    // The point under the cursor sits at the pane's centre, so the pane offset
    // is the scaled distance from that point back to the PHOTO's top-left
    // corner — not the frame's, which is what keeps the magnifier aligned now
    // that the photo is letterboxed rather than filling its box.
    //
    // Length values, not percentages: percentages are relative to (positioning
    // area - image size), which collapses to a no-op once the scaled image is
    // wider than the pane — always the case here.
    backgroundPosition: `${round(centre - (pointX - left) * zoom)}px ${round(
      centre - (pointY - top) * zoom
    )}px`,
  };
}
