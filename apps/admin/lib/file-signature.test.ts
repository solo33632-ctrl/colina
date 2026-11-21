import { describe, expect, it } from 'vitest';
import {
  detectFileSignature,
  fileContentMatchesDeclaration,
} from './file-signature';

// Stage 4c: the bytes are the evidence. These fixtures are the smallest real
// headers for each accepted format; everything else must detect as null.

const SIGNATURES = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
};

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('detectFileSignature', () => {
  it('recognises the four accepted formats', () => {
    expect(detectFileSignature(bytes(...SIGNATURES.jpeg))).toBe('jpeg');
    expect(detectFileSignature(bytes(...SIGNATURES.png))).toBe('png');
    expect(detectFileSignature(bytes(...SIGNATURES.webp))).toBe('webp');
    expect(detectFileSignature(bytes(...SIGNATURES.pdf))).toBe('pdf');
  });

  it('rejects active content and unknown formats', () => {
    const refused = [
      text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      text('<!doctype html><h1>hi</h1>'),
      text('plain text'),
      text(''),
      // A PNG header missing its final byte is not a PNG.
      bytes(...SIGNATURES.png.slice(0, -1)),
      // RIFF is not enough: the WEBP marker at byte 8 is required.
      bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45),
    ];
    for (const value of refused) {
      expect(detectFileSignature(value)).toBeNull();
    }
  });
});

describe('fileContentMatchesDeclaration', () => {
  it('accepts matching bytes, MIME type and extension', () => {
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.jpeg),
        'image/jpeg',
        'jpg'
      )
    ).toBe(true);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.jpeg),
        'image/jpeg',
        'jpeg'
      )
    ).toBe(true);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.png),
        'image/png',
        'png'
      )
    ).toBe(true);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.webp),
        'image/webp',
        'webp'
      )
    ).toBe(true);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.pdf),
        'application/pdf',
        'pdf'
      )
    ).toBe(true);
  });

  it('rejects a mismatch between bytes and the declared MIME type', () => {
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.png),
        'image/jpeg',
        'jpg'
      )
    ).toBe(false);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.pdf),
        'image/png',
        'png'
      )
    ).toBe(false);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.webp),
        'application/pdf',
        'pdf'
      )
    ).toBe(false);
  });

  it('rejects a mismatch between bytes and the extension', () => {
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.png),
        'image/png',
        'jpg'
      )
    ).toBe(false);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.jpeg),
        'image/jpeg',
        'png'
      )
    ).toBe(false);
    expect(
      fileContentMatchesDeclaration(
        bytes(...SIGNATURES.pdf),
        'application/pdf',
        'txt'
      )
    ).toBe(false);
  });

  it('rejects SVG/HTML even when the declaration claims an image', () => {
    expect(
      fileContentMatchesDeclaration(
        text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'image/png',
        'png'
      )
    ).toBe(false);
    expect(
      fileContentMatchesDeclaration(
        text('<!doctype html>'),
        'application/pdf',
        'pdf'
      )
    ).toBe(false);
  });
});
