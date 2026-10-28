import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Highlight, MarginNote } from '@/lib/types';
import { exportAnnotatedPdf, exportableData } from './exportPdf';

const highlight: Highlight = {
  id: 'highlight-1',
  docId: 'book',
  page: 1,
  rects: [
    { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
    { x: 0.1, y: 0.35, w: 0.2, h: 0.1 },
  ],
  text: 'Highlighted text',
  color: 'sky',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const note: MarginNote = {
  id: 'note-1',
  docId: 'book',
  page: 1,
  y: 0.5,
  text: 'Remember this λ',
  quote: 'A quoted passage',
  color: 'rose',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const name = (dict: PDFDict, key: string) => dict.lookup(PDFName.of(key), PDFName).asString();
const nums = (array: PDFArray) =>
  Array.from({ length: array.size() }, (_, i) => array.lookup(i, PDFNumber).asNumber());

describe('annotated PDF export', () => {
  it('preserves existing annotations and adds multi-quad highlights, linked notes and popups', async () => {
    const original = await PDFDocument.create();
    const page = original.addPage([300, 400]);
    page.setCropBox(10, 20, 200, 300);
    const link = original.context.register(
      original.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [5, 5, 20, 20] }),
    );
    page.node.set(PDFName.of('Annots'), original.context.obj([link]));
    const result = await exportAnnotatedPdf(await original.save(), {
      highlights: [highlight],
      notes: [{ ...note, id: 'linked', highlightId: highlight.id }, note],
    });
    expect(result.highlights).toBe(1);
    expect(result.notes).toBe(2);
    const reloaded = await PDFDocument.load(result.bytes);
    const annots = reloaded.getPage(0).node.Annots()!;
    expect(annots.size()).toBe(4);
    const dicts = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict));
    expect(dicts.map((dict) => name(dict, 'Subtype'))).toEqual(['/Link', '/Highlight', '/Text', '/Popup']);
    expect(nums(dicts[1].lookup(PDFName.of('QuadPoints'), PDFArray))).toEqual([
      30, 260, 90, 260, 30, 230, 90, 230, 30, 215, 70, 215, 30, 185, 70, 185,
    ]);
    expect(nums(dicts[1].lookup(PDFName.of('Rect'), PDFArray))).toEqual([30, 185, 90, 260]);
    expect(dicts[1].lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Remember this λ');
    expect(dicts[2].lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe(
      'Remember this λ\n\n“A quoted passage”',
    );
    expect(dicts[2].get(PDFName.of('Popup'))).toEqual(annots.get(3));
    expect(dicts[3].get(PDFName.of('Parent'))).toEqual(annots.get(2));
    const popupRect = nums(dicts[3].lookup(PDFName.of('Rect'), PDFArray));
    expect(popupRect[0]).toBeGreaterThanOrEqual(10);
    expect(popupRect[1]).toBeGreaterThanOrEqual(20);
    expect(popupRect[2]).toBeLessThanOrEqual(210);
    expect(popupRect[3]).toBeLessThanOrEqual(320);
  });

  it('maps rotated cropped pages and exports orphaned linked notes as sticky notes', async () => {
    const original = await PDFDocument.create();
    const page = original.addPage([400, 400]);
    page.setCropBox(10, 20, 200, 300);
    page.setRotation(degrees(90));
    const result = await exportAnnotatedPdf(await original.save(), {
      highlights: [{ ...highlight, rects: [highlight.rects[0]] }],
      notes: [{ ...note, highlightId: 'deleted-highlight' }],
    });
    const reloaded = await PDFDocument.load(result.bytes);
    const annots = reloaded.getPage(0).node.Annots()!;
    expect(annots.size()).toBe(3);
    const dict = annots.lookup(0, PDFDict);
    expect(nums(dict.lookup(PDFName.of('QuadPoints'), PDFArray))).toEqual([50, 50, 50, 140, 70, 50, 70, 140]);
    expect(name(annots.lookup(1, PDFDict), 'Subtype')).toBe('/Text');
  });

  it('keeps notes at the same anchor individually clickable', async () => {
    const original = await PDFDocument.create();
    original.addPage([300, 400]);
    const result = await exportAnnotatedPdf(await original.save(), {
      highlights: [],
      notes: [note, { ...note, id: 'note-2' }],
    });
    const reloaded = await PDFDocument.load(result.bytes);
    const annots = reloaded.getPage(0).node.Annots()!;
    const first = nums(annots.lookup(0, PDFDict).lookup(PDFName.of('Rect'), PDFArray));
    const second = nums(annots.lookup(2, PDFDict).lookup(PDFName.of('Rect'), PDFArray));
    expect(second[2]).toBeLessThan(first[0]);
    expect(second[1]).toBeCloseTo(first[1]);
  });

  it('filters invalid pages, empty notes and unusable highlight geometry', () => {
    const data = exportableData(
      [
        { ...note, text: '', quote: undefined },
        { ...note, page: 2 },
      ],
      [
        { ...highlight, rects: [] },
        { ...highlight, page: 0 },
      ],
      1,
    );
    expect(data).toEqual({ notes: [], highlights: [] });
  });

  it('refuses encrypted input instead of writing an unreadable copy', async () => {
    const original = await PDFDocument.create();
    original.addPage([300, 400]);
    original.context.trailerInfo.Encrypt = original.context.register(
      original.context.obj({ Filter: 'Standard' }),
    );
    const bytes = await original.save({ useObjectStreams: false });
    await expect(exportAnnotatedPdf(bytes, { highlights: [highlight], notes: [] })).rejects.toThrow(
      'Encrypted PDFs cannot be exported safely',
    );
  });
});
