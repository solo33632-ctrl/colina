import { describe, expect, it } from 'vitest';
import {
  buildCloudinarySrcset,
  CLOUDINARY_DEFAULT_WIDTH,
  CLOUDINARY_MAX_WIDTH,
  CLOUDINARY_SRCSET_WIDTHS,
  isCloudinaryDeliveryUrl,
  transformCloudinaryImageUrl,
} from './cloudinary-delivery';

const CLOUD = 'https://res.cloudinary.com/demo-cloud/image/upload';

/** The URL with one transformation inserted, for the shorter expectations. */
function delivered(path: string, width: number) {
  return `${CLOUD}/f_auto,q_auto,c_limit,w_${width}/${path}`;
}

describe('transformCloudinaryImageUrl: eligible URLs', () => {
  it('inserts the transformation immediately after /upload/', () => {
    expect(transformCloudinaryImageUrl(`${CLOUD}/v1712345678/tank.jpg`, 1200)).toBe(
      delivered('v1712345678/tank.jpg', 1200)
    );
  });

  it('inserts before a public id with no version segment', () => {
    expect(
      transformCloudinaryImageUrl(`${CLOUD}/colina/tank_01.webp`, 800)
    ).toBe(delivered('colina/tank_01.webp', 800));
  });

  it('preserves query strings and fragments verbatim', () => {
    expect(
      transformCloudinaryImageUrl(
        `${CLOUD}/v1/production/line.jpg?width=99&x=%20#hero`,
        1600
      )
    ).toBe(delivered('v1/production/line.jpg?width=99&x=%20#hero', 1600));
  });

  it('keeps an extremely long path intact', () => {
    const longName = `${'segment-'.repeat(250)}photo.jpg`;
    const result = transformCloudinaryImageUrl(`${CLOUD}/v9/${longName}`, 400);
    expect(result).toBe(delivered(`v9/${longName}`, 400));
    expect(result).toContain(longName);
  });

  it('preserves the requested width exactly', () => {
    for (const width of [400, 800, 1200, 1600, 2000]) {
      expect(transformCloudinaryImageUrl(`${CLOUD}/photo.jpg`, width)).toBe(
        delivered('photo.jpg', width)
      );
    }
  });
});

describe('transformCloudinaryImageUrl: unchanged URLs', () => {
  const unchanged = [
    ['an empty string', ''],
    ['arbitrary text', 'not a URL'],
    ['another host', 'https://cdn.example.com/image/upload/photo.jpg'],
    [
      'a lookalike host',
      'https://res.cloudinary.com.evil.test/demo/image/upload/photo.jpg',
    ],
    ['plain http', 'http://res.cloudinary.com/demo/image/upload/photo.jpg'],
    ['an uppercase scheme', 'HTTPS://res.cloudinary.com/demo/image/upload/photo.jpg'],
    ['an uppercase host', 'https://RES.CLOUDINARY.COM/demo/image/upload/photo.jpg'],
    [
      'a mixed-case host',
      'https://Res.Cloudinary.com/demo/image/upload/photo.jpg',
    ],
    ['a raw resource', 'https://res.cloudinary.com/demo/raw/upload/sheet.pdf'],
    ['a video resource', 'https://res.cloudinary.com/demo/video/upload/clip.mp4'],
    ['a missing upload path', 'https://res.cloudinary.com/demo/photo.jpg'],
    ['a missing cloud name', 'https://res.cloudinary.com//image/upload/photo.jpg'],
    ['an empty upload path', `${CLOUD}/`],
    ['a query-only upload path', `${CLOUD}?x=1`],
    ['a double slash in the path', `${CLOUD}//photo.jpg`],
    ['a trailing slash', `${CLOUD}/colina/`],
  ] as const;

  for (const [label, url] of unchanged) {
    it(`leaves ${label} untouched`, () => {
      expect(transformCloudinaryImageUrl(url, 1200)).toBe(url);
      expect(isCloudinaryDeliveryUrl(url)).toBe(false);
    });
  }

  it('leaves SVGs untouched, including uppercase extensions', () => {
    for (const filename of ['icon.svg', 'icon.SVG', 'line-drawing.Svg']) {
      const url = `${CLOUD}/v1/${filename}`;
      expect(transformCloudinaryImageUrl(url, 1200)).toBe(url);
      expect(isCloudinaryDeliveryUrl(url)).toBe(false);
    }
  });

  it('leaves PDFs untouched, including uppercase extensions', () => {
    for (const filename of ['sheet.pdf', 'sheet.PDF', 'Sheet.Pdf']) {
      const url = `${CLOUD}/v1/${filename}?download=1`;
      expect(transformCloudinaryImageUrl(url, 1200)).toBe(url);
      expect(isCloudinaryDeliveryUrl(url)).toBe(false);
    }
  });

  const alreadyTransformed = [
    'w_800/photo.jpg',
    'f_auto,q_auto,c_limit,w_1200/photo.jpg',
    'c_fill,h_400,w_600/photo.jpg',
    't_thumbnail/photo.jpg',
    'q_auto:good/photo.jpg',
    'fl_progressive/photo.jpg',
    'ar_16:9,c_fill/photo.jpg',
    'e_grayscale/photo.jpg',
    'if_w_gt_1000,w_500/photo.jpg',
  ];

  for (const path of alreadyTransformed) {
    it(`leaves the already-transformed ${path} untouched`, () => {
      const url = `${CLOUD}/${path}`;
      expect(transformCloudinaryImageUrl(url, 1200)).toBe(url);
      expect(isCloudinaryDeliveryUrl(url)).toBe(false);
    });
  }

  it('leaves an already-transformed URL with a version untouched', () => {
    const url = `${CLOUD}/f_auto,q_auto/v123/photo.jpg`;
    expect(transformCloudinaryImageUrl(url, 1200)).toBe(url);
    expect(isCloudinaryDeliveryUrl(url)).toBe(false);
  });

  it('leaves the URL untouched for an invalid width', () => {
    const url = `${CLOUD}/photo.jpg`;
    for (const width of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(transformCloudinaryImageUrl(url, width)).toBe(url);
    }
  });
});

describe('buildCloudinarySrcset', () => {
  it('lists every default width with a w descriptor', () => {
    const srcset = buildCloudinarySrcset(`${CLOUD}/v1/photo.jpg`);
    expect(srcset).not.toBeNull();

    const entries = srcset!.split(', ');
    expect(entries).toHaveLength(CLOUDINARY_SRCSET_WIDTHS.length);
    entries.forEach((entry, index) => {
      const width = CLOUDINARY_SRCSET_WIDTHS[index];
      expect(entry).toBe(
        `${CLOUD}/f_auto,q_auto,c_limit,w_${width}/v1/photo.jpg ${width}w`
      );
    });
  });

  it('keeps the query string on every candidate', () => {
    const srcset = buildCloudinarySrcset(`${CLOUD}/photo.jpg?token=abc`);
    expect(srcset).toBe(
      CLOUDINARY_SRCSET_WIDTHS.map(
        (width) =>
          `${CLOUD}/f_auto,q_auto,c_limit,w_${width}/photo.jpg?token=abc ${width}w`
      ).join(', ')
    );
  });

  it('accepts a custom width list', () => {
    expect(buildCloudinarySrcset(`${CLOUD}/photo.jpg`, [320, 640])).toBe(
      `${CLOUD}/f_auto,q_auto,c_limit,w_320/photo.jpg 320w, ` +
        `${CLOUD}/f_auto,q_auto,c_limit,w_640/photo.jpg 640w`
    );
  });

  it('returns null when no candidate can be built', () => {
    expect(buildCloudinarySrcset(`${CLOUD}/photo.jpg`, [])).toBeNull();
    expect(buildCloudinarySrcset(`${CLOUD}/photo.jpg`, [0, -5])).toBeNull();
  });

  it('returns null for every URL the transform leaves alone', () => {
    expect(
      buildCloudinarySrcset('https://picsum.photos/seed/colina/1200/800')
    ).toBeNull();
    expect(buildCloudinarySrcset(`${CLOUD}/w_800/photo.jpg`)).toBeNull();
    expect(buildCloudinarySrcset(`${CLOUD}/icon.svg`)).toBeNull();
    expect(buildCloudinarySrcset(`${CLOUD}/sheet.pdf`)).toBeNull();
    expect(
      buildCloudinarySrcset('https://res.cloudinary.com/demo/raw/upload/a.pdf')
    ).toBeNull();
  });
});

describe('delivery defaults', () => {
  it('uses w_1200 as the inline default and w_2000 as the largest derivative', () => {
    expect(CLOUDINARY_DEFAULT_WIDTH).toBe(1200);
    expect(CLOUDINARY_MAX_WIDTH).toBe(2000);
    expect(CLOUDINARY_SRCSET_WIDTHS).toEqual([400, 800, 1200, 1600, 2000]);
  });
});
