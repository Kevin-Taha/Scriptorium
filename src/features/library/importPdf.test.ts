import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryDocument } from '@/lib/types';
import { importPdfFile } from './importPdf';

const mocks = vi.hoisted(() => ({
  loadPdf: vi.fn(),
  destroyPdf: vi.fn(),
  readTitle: vi.fn(),
  renderThumbnailDataUrl: vi.fn(),
  getDocument: vi.fn(),
  putDocument: vi.fn(),
  contentHash: vi.fn(),
}));

vi.mock('@/lib/pdf/pdfjs', () => ({
  loadPdf: mocks.loadPdf,
  destroyPdf: mocks.destroyPdf,
  readTitle: mocks.readTitle,
}));
vi.mock('@/lib/pdf/thumbnail', () => ({ renderThumbnailDataUrl: mocks.renderThumbnailDataUrl }));
vi.mock('@/lib/storage/repository', () => ({
  getDocument: mocks.getDocument,
  putDocument: mocks.putDocument,
}));
vi.mock('@/lib/hash', () => ({ contentHash: mocks.contentHash }));

const bytes = new Uint8Array([37, 80, 68, 70]).buffer;
const file = { name: 'sample.pdf', size: 4, arrayBuffer: async () => bytes } as File;
const pdf = { numPages: 12 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadPdf.mockResolvedValue(pdf);
  mocks.contentHash.mockResolvedValue('content-hash');
  mocks.readTitle.mockResolvedValue('Sample');
  mocks.renderThumbnailDataUrl.mockResolvedValue('data:image/jpeg;base64,cover');
  mocks.getDocument.mockResolvedValue(undefined);
  mocks.putDocument.mockResolvedValue(undefined);
});

describe('PDF import', () => {
  it('uses a copied buffer, generates metadata, and releases the document', async () => {
    const result = await importPdfFile(file);
    expect(mocks.loadPdf.mock.calls[0][0]).not.toBe(bytes);
    expect(mocks.loadPdf.mock.calls[0][0]).toEqual(bytes);
    expect(result.isNew).toBe(true);
    expect(result.doc).toMatchObject({
      id: 'content-hash',
      title: 'Sample',
      pageCount: 12,
      coverDataUrl: 'data:image/jpeg;base64,cover',
    });
    expect(mocks.renderThumbnailDataUrl).toHaveBeenCalledWith(pdf, 1, 240);
    expect(mocks.putDocument).toHaveBeenCalledWith(result.doc, expect.any(Blob));
    const stored = mocks.putDocument.mock.calls[0][1] as Blob;
    expect(stored).not.toBe(file);
    expect(stored.type).toBe('application/pdf');
    expect(stored.size).toBe(bytes.byteLength);
    expect(mocks.destroyPdf).toHaveBeenCalledWith(pdf);
  });

  it('reopens an identical file without parsing it, keeping metadata and refreshing its stored copy', async () => {
    const existing: LibraryDocument = {
      id: 'content-hash',
      title: 'Original',
      fileName: 'original.pdf',
      fileSize: 4,
      pageCount: 12,
      addedAt: 1,
      lastOpenedAt: 2,
    };
    mocks.getDocument.mockResolvedValue(existing);
    const result = await importPdfFile(file);
    expect(result.isNew).toBe(false);
    expect(result.doc).toEqual({
      ...existing,
      lastOpenedAt: result.doc.lastOpenedAt,
      source: { kind: 'imported' },
    });
    expect(result.doc.lastOpenedAt).toBeGreaterThan(existing.lastOpenedAt);
    expect(mocks.putDocument).toHaveBeenCalledWith(result.doc, expect.any(Blob));
    expect(mocks.loadPdf).not.toHaveBeenCalled();
    expect(mocks.renderThumbnailDataUrl).not.toHaveBeenCalled();
  });

  it('gives a book from the linked folder its own copy when the same PDF is imported', async () => {
    mocks.getDocument.mockResolvedValue({
      id: 'content-hash',
      title: 'Original',
      fileName: 'original.pdf',
      fileSize: 4,
      pageCount: 12,
      addedAt: 1,
      lastOpenedAt: 2,
      source: { kind: 'folder', path: 'Physics/original.pdf', missing: true },
    } satisfies LibraryDocument);
    const result = await importPdfFile(file);
    expect(result.doc.source).toEqual({ kind: 'imported' });
    expect(mocks.putDocument).toHaveBeenCalledWith(result.doc, expect.any(Blob));
  });

  it('reports corrupt and password-protected PDFs without storing them', async () => {
    mocks.loadPdf.mockRejectedValueOnce(new Error('bad file'));
    await expect(importPdfFile(file)).rejects.toThrow('valid PDF');
    mocks.loadPdf.mockRejectedValueOnce({ name: 'PasswordException' });
    await expect(importPdfFile(file)).rejects.toThrow('Password-protected PDFs aren’t supported yet.');
    expect(mocks.putDocument).not.toHaveBeenCalled();
  });

  it('releases the PDF and does not store a failed cover', async () => {
    mocks.renderThumbnailDataUrl.mockRejectedValue(new Error('render failed'));
    await expect(importPdfFile(file)).rejects.toThrow('valid PDF');
    expect(mocks.putDocument).not.toHaveBeenCalled();
    expect(mocks.destroyPdf).toHaveBeenCalledWith(pdf);
  });

  it('reports storage failure and releases the PDF', async () => {
    mocks.putDocument.mockRejectedValue(new DOMException('quota', 'QuotaExceededError'));
    await expect(importPdfFile(file)).rejects.toThrow('Not enough storage space');
    expect(mocks.destroyPdf).toHaveBeenCalledWith(pdf);
  });
});
