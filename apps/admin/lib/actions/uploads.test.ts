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
