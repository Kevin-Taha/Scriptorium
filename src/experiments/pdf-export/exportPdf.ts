import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFPage } from 'pdf-lib';
import type { Highlight, MarginNote } from '@/lib/types';
import { exportableData, validRect } from './exportable';
import { annotationColor, bounds, noteRect, type PageBox, type PdfRect, quadPoints } from './geometry';

export { exportableData };

interface ExportData {
  highlights: readonly Highlight[];
  notes: readonly MarginNote[];
}

/** pdf.js renders the intersection of CropBox and MediaBox, not MediaBox alone. */
function pageBox(page: PDFPage): PageBox {
  const crop = page.getCropBox();
  const media = page.getMediaBox();
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const right = Math.min(crop.x + crop.width, media.x + media.width);
  const top = Math.min(crop.y + crop.height, media.y + media.height);
  const box = right > x && top > y ? { x, y, width: right - x, height: top - y } : media;
  return { ...box, rotation: page.getRotation().angle };
}

function appendAnnotation(page: PDFPage, ref: ReturnType<PDFDocument['context']['register']>) {
  let annotations = page.node.Annots();
  if (!annotations) {
    annotations = page.doc.context.obj([]);
    page.node.set(PDFName.of('Annots'), annotations);
  }
  annotations.push(ref);
}

function date(stamp: number): PDFString {
  const value = new Date(stamp);
  return PDFString.fromDate(Number.isFinite(value.getTime()) ? value : new Date());
}

function overlaps(a: PdfRect, b: PdfRect): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/** Pure export core: no DOM, stores, or file-system access. */
export async function exportAnnotatedPdf(bytes: ArrayBuffer | Uint8Array, input: ExportData) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  // pdf-lib does not decrypt encrypted streams, even with ignoreEncryption.
  if (pdf.isEncrypted) throw new Error('Encrypted PDFs cannot be exported safely. Use an unencrypted copy.');
  const pages = pdf.getPages();
  const { notes, highlights } = exportableData(input.notes, input.highlights, pages.length);
  if (!notes.length && !highlights.length) throw new Error('There are no notes or highlights to export.');
  const linkedNotes = new Map<string, MarginNote[]>();
  const highlightIds = new Set(highlights.map((h) => h.id));
  for (const note of notes) {
    if (note.highlightId && highlightIds.has(note.highlightId)) {
      const list = linkedNotes.get(note.highlightId) ?? [];
      list.push(note);
      linkedNotes.set(note.highlightId, list);
    }
  }

  for (const highlight of highlights) {
    const page = pages[highlight.page - 1];
    const box = pageBox(page);
    const points = highlight.rects.filter(validRect).flatMap((rect) => quadPoints(rect, box));
    const dict = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      P: page.ref,
      Rect: bounds(points),
      QuadPoints: points,
      C: annotationColor(highlight.color),
      CA: 0.4,
      Contents: PDFHexString.fromText((linkedNotes.get(highlight.id) ?? []).map((n) => n.text).join('\n\n')),
      T: PDFHexString.fromText('Scriptorium'),
      M: date(highlight.updatedAt),
      CreationDate: date(highlight.createdAt),
      F: 4,
      NM: PDFHexString.fromText(highlight.id),
    });
    appendAnnotation(page, pdf.context.register(dict));
  }

  const occupiedByPage = new Map<number, PdfRect[]>();
  for (const note of notes) {
    if (note.highlightId && highlightIds.has(note.highlightId)) continue;
    const page = pages[note.page - 1];
    const box = pageBox(page);
    const occupied = occupiedByPage.get(note.page) ?? [];
    let rect = noteRect(note.y, box);
    // Notes at the same anchor should remain individually clickable in other viewers.
    for (let i = 1; i <= occupied.length && occupied.some((other) => overlaps(rect, other)); i++) {
      rect = noteRect(note.y, box, i * 20);
    }
    occupied.push(rect);
    occupiedByPage.set(note.page, occupied);
    const parent = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      P: page.ref,
      Rect: rect,
      Name: 'Comment',
      C: annotationColor(note.color),
      Contents: PDFHexString.fromText(`${note.text}${note.quote ? `\n\n“${note.quote}”` : ''}`),
      T: PDFHexString.fromText('Scriptorium'),
      M: date(note.updatedAt),
      CreationDate: date(note.createdAt),
      F: 4,
      NM: PDFHexString.fromText(note.id),
      Open: false,
    });
    const parentRef = pdf.context.register(parent);
    const popupWidth = Math.min(200, box.width);
    const popupHeight = Math.min(120, box.height);
    const popupX = Math.max(box.x, Math.min(box.x + box.width - popupWidth, rect[0] - popupWidth));
    const popupY = Math.max(box.y, Math.min(box.y + box.height - popupHeight, rect[1]));
    const popup = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Popup',
      P: page.ref,
      Parent: parentRef,
      Rect: [popupX, popupY, popupX + popupWidth, popupY + popupHeight],
      Open: false,
    });
    const popupRef = pdf.context.register(popup);
    parent.set(PDFName.of('Popup'), popupRef);
    appendAnnotation(page, parentRef);
    appendAnnotation(page, popupRef);
  }

  return { bytes: await pdf.save(), highlights: highlights.length, notes: notes.length };
}
