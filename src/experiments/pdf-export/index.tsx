import { FileDown, LoaderCircle } from 'lucide-react';
import { create } from 'zustand';
import { showToast } from '@/components/Toast';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { useNotesStore } from '@/features/notes/notesStore';
import { useReaderStore } from '@/features/reader/readerStore';
import { readBookBytes } from '@/features/sync/bookBytes';
import { EXPERIMENT_EVENTS, useExperimentEvent } from '../shared/events';
import type { ExperimentModule } from '../types';
import { exportableData } from './exportable';
import './pdfExport.css';

const useExportState = create<{ busy: boolean }>(() => ({ busy: false }));

async function startExport() {
  if (useExportState.getState().busy) return;
  const { doc, status } = useReaderStore.getState();
  const notesState = useNotesStore.getState();
  const highlightsState = useHighlightsStore.getState();
  if (!doc || status !== 'ready' || notesState.docId !== doc.id || highlightsState.docId !== doc.id) return;
  const { notes, highlights } = exportableData(notesState.notes, highlightsState.highlights, doc.pageCount);
  if (!notes.length && !highlights.length) {
    showToast('There are no notes or highlights to export.');
    return;
  }

  useExportState.setState({ busy: true });
  try {
    const bytes = await readBookBytes(doc);
    // pdf-lib is large; load the exporter only when someone exports.
    const { exportAnnotatedPdf } = await import('./exportPdf');
    const result = await exportAnnotatedPdf(bytes, { notes, highlights });
    const fileName = `${doc.title} (annotated).pdf`;
    const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const parts = [
      result.highlights ? `${result.highlights} ${result.highlights === 1 ? 'highlight' : 'highlights'}` : '',
      result.notes ? `${result.notes} ${result.notes === 1 ? 'note' : 'notes'}` : '',
    ].filter(Boolean);
    showToast(`Saved “${fileName}” — ${parts.join(' and ')}`);
  } catch (error) {
    showToast(
      error instanceof Error ? `Couldn’t export the PDF: ${error.message}` : 'Couldn’t export the PDF.',
      { tone: 'error' },
    );
  } finally {
    useExportState.setState({ busy: false });
  }
}

function ExportListener() {
  useExperimentEvent(EXPERIMENT_EVENTS.exportAnnotatedPdf, () => void startExport());
  return null;
}

function ExportButton() {
  const busy = useExportState((s) => s.busy);
  const doc = useReaderStore((s) => s.doc);
  const status = useReaderStore((s) => s.status);
  const notes = useNotesStore((s) => s.notes);
  const notesDocId = useNotesStore((s) => s.docId);
  const highlights = useHighlightsStore((s) => s.highlights);
  const highlightsDocId = useHighlightsStore((s) => s.docId);
  const data = exportableData(notes, highlights, doc?.pageCount ?? 0);
  const enabled =
    !!doc &&
    status === 'ready' &&
    notesDocId === doc.id &&
    highlightsDocId === doc.id &&
    (data.notes.length > 0 || data.highlights.length > 0);
  return (
    <button
      type="button"
      className="btn pdf-export__button tooltip tooltip--below"
      aria-label="Export PDF"
      data-tooltip="Download a copy of the PDF with your highlights and notes"
      disabled={!enabled || busy}
      onClick={() => void startExport()}
    >
      {busy ? (
        <LoaderCircle className="pdf-export__spinner" aria-hidden="true" />
      ) : (
        <FileDown aria-hidden="true" />
      )}
      <span>Export PDF</span>
    </button>
  );
}

const experiment: ExperimentModule = { App: ExportListener, ReviewToolbar: ExportButton };
export default experiment;
