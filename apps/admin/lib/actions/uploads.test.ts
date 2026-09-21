import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '../admin-action';
import { uploadBuffer } from '../cloudinary';
import { uploadDatasheet, uploadImage } from './uploads';

// Upload action contract tests. No real Cloudinary call is made: only
// `uploadBuffer` (the actual network I/O) is mocked, so everything else —
// env-var configuration reads, auth gate, MIME/extension/size validation,
// error mapping — runs for real. The point is to prove every failure
// path returns a structured error (never a silent crash) and that a
// successful upload surfaces the delivered secure URL.
vi.mock('../admin-action', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('../cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cloudinary')>();
  return { ...actual, uploadBuffer: vi.fn() };
});

const SESSION = {
  user: { id: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
};

const ORIGINAL_ENV = process.env;

function clearCloudinaryEnv() {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
}

function setPlaceholderCloudinaryEnv() {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = '123456789012345';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
}

beforeEach(() => {
  vi.resetAllMocks();
  clearCloudinaryEnv();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function fileFormData(name: string, type: string, bytes: number): FormData {
  const formData = new FormData();
  formData.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return formData;
}

describe('upload actions: Cloudinary unconfigured', () => {
  it('returns unconfigured (clear error, no crash) when env vars are missing', async () => {
    const result = await uploadImage(
      fileFormData('photo.png', 'image/png', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'unconfigured' });
  });

  it('returns unconfigured for datasheets too when env vars are missing', async () => {
    const result = await uploadDatasheet(
      fileFormData('sheet.pdf', 'application/pdf', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'unconfigured' });
  });
});

describe('upload actions: session required', () => {
  it('returns unauthorized without an admin session', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const result = await uploadImage(
      fileFormData('photo.png', 'image/png', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('upload actions: validation before any upload', () => {
  it('rejects a missing file', async () => {
    setPlaceholderCloudinaryEnv();
    const result = await uploadImage(new FormData());
    expect(result).toEqual({ ok: false, error: 'no_file' });
  });

  it('rejects non-image MIME types for images', async () => {
    setPlaceholderCloudinaryEnv();
    const result = await uploadImage(
      fileFormData('notes.txt', 'text/plain', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'invalid_type' });
  });

  it('rejects wrong extensions for images even with an image MIME type', async () => {
    setPlaceholderCloudinaryEnv();
    const result = await uploadImage(
      fileFormData('photo.gif', 'image/gif', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'invalid_type' });
  });

  it('rejects non-PDF types for datasheets', async () => {
    setPlaceholderCloudinaryEnv();
    const result = await uploadDatasheet(
      fileFormData('sheet.txt', 'text/plain', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'invalid_type' });
  });

  it('rejects images over 5 MB', async () => {
    setPlaceholderCloudinaryEnv();
    const result = await uploadImage(
      fileFormData('big.png', 'image/png', 5 * 1024 * 1024 + 1)
    );
    expect(result).toEqual({ ok: false, error: 'too_large' });
  });

  it('rejects PDFs over 15 MB', async () => {
    setPlaceholderCloudinaryEnv();
    const result = await uploadDatasheet(
      fileFormData('big.pdf', 'application/pdf', 15 * 1024 * 1024 + 1)
    );
    expect(result).toEqual({ ok: false, error: 'too_large' });
  });
});

describe('upload actions: successful upload', () => {
  it('returns the delivered secure URL on success', async () => {
    setPlaceholderCloudinaryEnv();
    vi.mocked(uploadBuffer).mockResolvedValue({
      secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/abc.png',
      publicId: 'abc',
    });
    const result = await uploadImage(
      fileFormData('photo.webp', 'image/webp', 1024)
    );
    expect(result).toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/image/upload/abc.png',
    });
    expect(uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), {
      resourceType: 'image',
      folder: 'colina',
    });
  });

  it('maps Cloudinary rejection to upload_failed (no crash)', async () => {
    setPlaceholderCloudinaryEnv();
    vi.mocked(uploadBuffer).mockRejectedValue(new Error('Invalid credentials'));
    const result = await uploadImage(
      fileFormData('photo.png', 'image/png', 1024)
    );
    expect(result).toEqual({ ok: false, error: 'upload_failed' });
  });
});
