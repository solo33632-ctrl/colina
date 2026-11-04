import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createNews, deleteNews, updateNews } from './news';

vi.mock('@colina/db', () => {
  const txNewsPost = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txAuditLog = { create: vi.fn() };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ newsPost: txNewsPost, auditLog: txAuditLog })
    ),
  };
  (prisma as Record<string, unknown>).txNewsPost = txNewsPost;
  (prisma as Record<string, unknown>).txAuditLog = txAuditLog;
  return { prisma };
});

vi.mock('../admin-action', () => ({ requireAdmin: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `msg-${key}`),
}));

const SESSION = {
  user: { id: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
};

const INPUT = {
  slug: 'news-title',
  titleEn: 'News title',
  titleAr: 'عنوان الخبر',
  bodyEn: 'English body text.',
  bodyAr: 'نص الخبر العربي.',
  image: '',
};

const STORED = {
  id: 'news-1',
  titleEn: 'News title',
  titleAr: 'عنوان الخبر',
  slug: 'news-title',
  bodyEn: 'English body text.',
  bodyAr: 'نص الخبر العربي.',
  image: null,
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    news: mock.txNewsPost as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().news.create.mockResolvedValue(STORED);
  doubles().news.update.mockResolvedValue(STORED);
  doubles().news.delete.mockResolvedValue(STORED);
  doubles().news.findUnique.mockResolvedValue(STORED);
  doubles().auditLog.create.mockResolvedValue({});
});

describe('createNews', () => {
  it('records an identifying snapshot and no internal fields', async () => {
    doubles().news.create.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await createNews(INPUT);

    expect(result).toEqual({ ok: true, slug: 'news-title' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: 'admin-1',
      action: 'NEWS_CREATE',
      entity: 'NewsPost:news-title',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'titleEn',
          labelKey: 'titleEn',
          type: 'text',
          from: null,
          to: 'News title',
        },
        {
          field: 'titleAr',
          labelKey: 'titleAr',
          type: 'text',
          from: null,
          to: 'عنوان الخبر',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: null,
          to: 'news-title',
        },
      ],
      ...label('News title', 'عنوان الخبر'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('must-not-leak');
    expect(json).not.toContain('English body text.');
  });
});

describe('updateNews', () => {
  it('loads the before-row inside the transaction with the allowlisted select', async () => {
    await updateNews('news-1', INPUT);

    expect(doubles().news.findUnique).toHaveBeenCalledWith({
      where: { id: 'news-1' },
      select: {
        titleEn: true,
        titleAr: true,
        slug: true,
        bodyEn: true,
        bodyAr: true,
        image: true,
        publishedAt: true,
      },
    });
  });

  it('records exactly the changed allowlisted fields', async () => {
    doubles().news.findUnique.mockResolvedValue({
      ...STORED,
      titleEn: 'Old title',
      slug: 'old-slug',
    });
    doubles().news.update.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await updateNews('news-1', INPUT);

    expect(result).toEqual({ ok: true, slug: 'news-title' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'NEWS_UPDATE',
      entity: 'NewsPost:news-title',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'titleEn',
          labelKey: 'titleEn',
          type: 'text',
          from: 'Old title',
          to: 'News title',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'old-slug',
          to: 'news-title',
        },
      ],
      ...label('News title', 'عنوان الخبر'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('must-not-leak');
  });

  it('still writes an entry with an empty changes list on a no-op save', async () => {
    await updateNews('news-1', INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [],
      ...label('News title', 'عنوان الخبر'),
    });
  });

  it('returns not_found without writing when the row is gone', async () => {
    doubles().news.findUnique.mockResolvedValue(null);

    await expect(updateNews('missing', INPUT)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().news.update).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('maps an audit failure to a generic server_error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    doubles().auditLog.create.mockRejectedValue(
      new Error('raw database detail that must not reach the client')
    );

    const result = await updateNews('news-1', INPUT);

    expect(result).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
    consoleError.mockRestore();
  });
});

describe('deleteNews', () => {
  it('records the identifying snapshot in the Before column', async () => {
    doubles().news.findUnique.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    await expect(deleteNews('news-1')).resolves.toEqual({ ok: true });

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'NEWS_DELETE',
      entity: 'NewsPost:news-title',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'titleEn',
          labelKey: 'titleEn',
          type: 'text',
          from: 'News title',
          to: null,
        },
        {
          field: 'titleAr',
          labelKey: 'titleAr',
          type: 'text',
          from: 'عنوان الخبر',
          to: null,
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'news-title',
          to: null,
        },
      ],
      ...label('News title', 'عنوان الخبر'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('returns not_found without deleting when the row is gone', async () => {
    doubles().news.findUnique.mockResolvedValue(null);

    await expect(deleteNews('missing')).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().news.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
