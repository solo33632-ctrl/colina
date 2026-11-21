// Stage 4c: file content checks for admin uploads.
//
// A browser-supplied `File.type` and filename are claims, not evidence: an
// EDITOR could rename `payload.html` to `photo.png` and declare it
// `image/png`, or ship an SVG with an image MIME type whose contents the
// browser would execute when opened directly. The upload action therefore
// checks the leading bytes before anything is sent to Cloudinary.
//
// Only the four formats the panel accepts are recognised:
//   jpeg: FF D8 FF
//   png:  89 50 4E 47 0D 0A 1A 0A
//   webp: "RIFF" .... "WEBP"
//   pdf:  "%PDF-"
//
// Anything else — SVG, HTML, a text file, a truncated header — detects as
// `null` and is refused. The declared MIME type and the filename extension
// must also agree with the detected format, so a PNG renamed `.jpg` (or a
// PDF declared `image/png`) is a mismatch rather than a successful upload.

export type FileSignature = 'jpeg' | 'png' | 'webp' | 'pdf';

function asciiAt(buffer: Uint8Array, start: number, end: number): string {
  let text = '';
  for (let i = start; i < end; i += 1) {
    text += String.fromCharCode(buffer[i]);
  }
  return text;
}

function startsWith(buffer: Uint8Array, bytes: number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }
  return bytes.every((byte, index) => buffer[index] === byte);
}

/** Detects the real format from the leading bytes, or null when unknown. */
export function detectFileSignature(buffer: Uint8Array): FileSignature | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    asciiAt(buffer, 0, 4) === 'RIFF' &&
    asciiAt(buffer, 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'pdf';
  }
  return null;
}

const DECLARED_TYPES: Record<
  FileSignature,
  { mimeType: string; extensions: readonly string[] }
> = {
  jpeg: { mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  png: { mimeType: 'image/png', extensions: ['png'] },
  webp: { mimeType: 'image/webp', extensions: ['webp'] },
  pdf: { mimeType: 'application/pdf', extensions: ['pdf'] },
};

/**
 * True only when the bytes, the declared MIME type and the filename extension
 * all describe the same accepted format. The extension passed here is already
 * lowercased by the caller.
 */
export function fileContentMatchesDeclaration(
  buffer: Uint8Array,
  mimeType: string,
  extension: string
): boolean {
  const signature = detectFileSignature(buffer);
  if (!signature) {
    return false;
  }
  const declared = DECLARED_TYPES[signature];
  return (
    declared.mimeType === mimeType && declared.extensions.includes(extension)
  );
}
