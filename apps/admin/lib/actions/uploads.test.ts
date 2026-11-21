import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { uploadBuffer } from '../cloudinary';
import { uploadDatasheet, uploadImage } from './uploads';

// Upload action contract tests. No real Cloudinary call is made: only
// `uploadBuffer` (the actual network I/O) is mocked, so everything else —
// env-var configuration reads, auth gate, MIME/extension/size validation,
// error mapping — runs for real. The point is to prove every failure
// path returns a structured error (never a silent crash) and that a
// successful upload surfaces the delivered secure URL.
vi.mock('@colina/db', () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    machine: { findUnique: vi.fn() },
    machineCategory: { findUnique: vi.fn() },
  },
}));

vi.mock('../admin-action', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('../cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cloudinary')>();
  return { ...actual, uploadBuffer: vi.fn() };
});

const SESSION = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin One',
    role: 'SUPER_ADMIN',
  },
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

// Real minimal headers for the formats the action accepts. Stage 4c checks
// content magic bytes, so a fixture must carry the signature its declared type
// claims — the rest of the buffer is padding.
const SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ],
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
};

function fileFormData(
  name: string,
  type: string,
  bytes: number,
  target: { kind: string; id?: string } = { kind: 'other' }
): FormData {
  const formData = new FormData();
  formData.set('target', target.kind);
  if (target.id) {
    formData.set('targetId', target.id);
  }
  const content = new Uint8Array(bytes);
  const signature = SIGNATURES[type];
  if (signature) {
    content.set(signature.slice(0, bytes));
  }
  formData.set('file', new File([content], name, { type }));
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

describe('upload actions: target context and ownership', () => {
  const EDITOR_SESSION = {
    user: { id: 'editor-1', email: 'editor@example.com', role: 'EDITOR' },
  };

  it('rejects a form that sends no target context', async () => {
    const result = await uploadImage(new FormData());
    expect(result).toEqual({ ok: false, error: 'invalid_target' });
  });

  it('denies an editor the non-machine context', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(EDITOR_SESSION as never);
    const result = await uploadImage(
      fileFormData('photo.png', 'image/png', 1024, { kind: 'other' })
    );
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('allows an editor to prepare media for a machine/category not created yet', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(EDITOR_SESSION as never);
    setPlaceholderCloudinaryEnv();
    vi.mocked(uploadBuffer).mockResolvedValue({
      secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/new.png',
      publicId: 'new',
    });

    await expect(
      uploadImage(
        fileFormData('photo.png', 'image/png', 1024, { kind: 'machine' })
      )
    ).resolves.toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/image/upload/new.png',
    });
    await expect(
      uploadImage(
        fileFormData('photo.png', 'image/png', 1024, { kind: 'category' })
      )
    ).resolves.toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/image/upload/new.png',
    });
  });

  it('allows an editor to replace media on its own machine and category', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(EDITOR_SESSION as never);
    setPlaceholderCloudinaryEnv();
    vi.mocked(prisma.machine.findUnique).mockResolvedValue({
      createdById: 'editor-1',
    } as never);
    vi.mocked(prisma.machineCategory.findUnique).mockResolvedValue({
      createdById: 'editor-1',
    } as never);
    vi.mocked(uploadBuffer).mockResolvedValue({
      secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/own.png',
      publicId: 'own',
    });

    await expect(
      uploadImage(
        fileFormData('photo.png', 'image/png', 1024, {
          kind: 'machine',
          id: 'machine-1',
        })
      )
    ).resolves.toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/image/upload/own.png',
    });
    await expect(
      uploadDatasheet(
        fileFormData('sheet.pdf', 'application/pdf', 1024, {
          kind: 'machine',
          id: 'machine-1',
        })
      )
    ).resolves.toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/image/upload/own.png',
    });
    await expect(
      uploadImage(
        fileFormData('photo.png', 'image/png', 1024, {
          kind: 'category',
          id: 'cat-1',
        })
      )
    ).resolves.toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/image/upload/own.png',
    });
  });

  it("denies an editor media for another owner's machine or a null creator", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(EDITOR_SESSION as never);
    setPlaceholderCloudinaryEnv();

    for (const createdById of ['editor-2', null]) {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        createdById,
      } as never);
      await expect(
        uploadImage(
          fileFormData('photo.png', 'image/png', 1024, {
            kind: 'machine',
            id: 'machine-1',
          })
        ),
        `machine creator ${createdById}`
      ).resolves.toEqual({ ok: false, error: 'forbidden' });
      await expect(
        uploadDatasheet(
          fileFormData('sheet.pdf', 'application/pdf', 1024, {
            kind: 'machine',
            id: 'machine-1',
          })
        ),
        `datasheet creator ${createdById}`
      ).resolves.toEqual({ ok: false, error: 'forbidden' });
    }
  });

  it("denies an editor media for another owner's category", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(EDITOR_SESSION as never);
    setPlaceholderCloudinaryEnv();
    vi.mocked(prisma.machineCategory.findUnique).mockResolvedValue({
      createdById: 'editor-2',
    } as never);

    await expect(
      uploadImage(
        fileFormData('photo.png', 'image/png', 1024, {
          kind: 'category',
          id: 'cat-1',
        })
      )
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('upload actions: validation before any upload', () => {
  it('rejects a missing file', async () => {
    setPlaceholderCloudinaryEnv();
    const formData = new FormData();
    formData.set('target', 'other');
    const result = await uploadImage(formData);
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

  it('rejects a text file renamed and declared as a PNG before Cloudinary', async () => {
    setPlaceholderCloudinaryEnv();
    const formData = new FormData();
    formData.set('target', 'other');
    formData.set(
      'file',
      new File([new TextEncoder().encode('not really a png')], 'photo.png', {
        type: 'image/png',
      })
    );
    const result = await uploadImage(formData);
    expect(result).toEqual({ ok: false, error: 'invalid_type' });
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects an SVG or HTML file declared as an image', async () => {
    setPlaceholderCloudinaryEnv();
    for (const content of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<!doctype html><script>alert(1)</script>',
    ]) {
      const formData = new FormData();
      formData.set('target', 'other');
      formData.set(
        'file',
        new File([new TextEncoder().encode(content)], 'photo.png', {
          type: 'image/png',
        })
      );
      await expect(uploadImage(formData), content).resolves.toEqual({
        ok: false,
        error: 'invalid_type',
      });
    }
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects bytes that are a different accepted format than declared', async () => {
    setPlaceholderCloudinaryEnv();
    const formData = new FormData();
    formData.set('target', 'other');
    // Real PNG bytes behind a .jpg / image/jpeg declaration.
    formData.set(
      'file',
      new File([new Uint8Array(SIGNATURES['image/png'])], 'photo.jpg', {
        type: 'image/jpeg',
      })
    );
    const result = await uploadImage(formData);
    expect(result).toEqual({ ok: false, error: 'invalid_type' });
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects HTML bytes declared as a PDF datasheet', async () => {
    setPlaceholderCloudinaryEnv();
    const formData = new FormData();
    formData.set('target', 'other');
    formData.set(
      'file',
      new File([new TextEncoder().encode('<html>hi</html>')], 'sheet.pdf', {
        type: 'application/pdf',
      })
    );
    const result = await uploadDatasheet(formData);
    expect(result).toEqual({ ok: false, error: 'invalid_type' });
    expect(uploadBuffer).not.toHaveBeenCalled();
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
    // Stage 28c: images are capped at 2400 px on the longest side with
    // automatic quality by Cloudinary's incoming transformation.
    expect(uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), {
      resourceType: 'image',
      folder: 'colina',
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      incomingTransformation: 'c_limit,w_2400,h_2400,q_auto',
    });
    // Stage 2a: every stored asset has an audit row.
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: 'admin-1',
        actorEmail: 'admin@example.com',
        actorName: 'Admin One',
        action: 'UPLOAD_CREATE',
        entity: 'Cloudinary:image:abc',
        details: {
          kind: 'image',
          mimeType: 'image/webp',
          bytes: 1024,
          label: { en: 'abc', ar: 'abc' },
          search: 'abc',
          changes: [],
        },
      },
    });
  });

  it('audits a datasheet upload with the raw resource type', async () => {
    setPlaceholderCloudinaryEnv();
    vi.mocked(uploadBuffer).mockResolvedValue({
      secureUrl: 'https://res.cloudinary.com/test-cloud/raw/upload/sheet.pdf',
      publicId: 'colina/datasheets/sheet',
    });
    const result = await uploadDatasheet(
      fileFormData('sheet.pdf', 'application/pdf', 2048)
    );
    expect(result).toEqual({
      ok: true,
      url: 'https://res.cloudinary.com/test-cloud/raw/upload/sheet.pdf',
    });
    // Datasheets are raw resources: no incoming transformation, ever.
    expect(uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), {
      resourceType: 'raw',
      folder: 'colina/datasheets',
      allowedFormats: ['pdf'],
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: 'admin-1',
        actorEmail: 'admin@example.com',
        actorName: 'Admin One',
        action: 'UPLOAD_CREATE',
        entity: 'Cloudinary:raw:colina/datasheets/sheet',
        details: {
          kind: 'datasheet',
          mimeType: 'application/pdf',
          bytes: 2048,
          label: {
            en: 'colina/datasheets/sheet',
            ar: 'colina/datasheets/sheet',
          },
          search: 'colina/datasheets/sheet',
          changes: [],
        },
      },
    });
  });

  it('fails closed when the audit row cannot be written', async () => {
    setPlaceholderCloudinaryEnv();
    vi.mocked(uploadBuffer).mockResolvedValue({
      secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/abc.png',
      publicId: 'abc',
    });
    vi.mocked(prisma.auditLog.create).mockRejectedValue(
      new Error('database unavailable')
    );
    const result = await uploadImage(
      fileFormData('photo.png', 'image/png', 1024)
    );
    // The URL is withheld: an unaudited asset can never reach the form.
    expect(result).toEqual({ ok: false, error: 'server_error' });
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
