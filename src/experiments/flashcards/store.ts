import { create } from 'zustand';
import { showToast } from '@/components/Toast';
import type { CardSchedule, Schedules } from './schedule';

const PREFIX = 'scriptorium.exp.flashcards.';

function readSchedules(docId: string): Schedules {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFIX + docId) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => {
        if (!value || typeof value !== 'object') return false;
        const state = value as CardSchedule;
        return (
          Number.isFinite(state.due) &&
          Number.isFinite(state.interval) &&
          state.interval > 0 &&
          Number.isFinite(state.ease) &&
          typeof state.learning === 'boolean'
        );
      }),
    );
  } catch {
    return {};
  }
}

interface FlashcardStore {
  docId: string | null;
  schedules: Schedules;
  load(docId: string | null): void;
  save(docId: string, cardId: string, schedule: CardSchedule): void;
}

export const useFlashcardStore = create<FlashcardStore>()((set, get) => ({
  docId: null,
  schedules: {},
  load(docId) {
    if (get().docId === docId) return;
    set({ docId, schedules: docId ? readSchedules(docId) : {} });
  },
  save(docId, cardId, schedule) {
    const current = get();
    const schedules = {
      ...(current.docId === docId ? current.schedules : readSchedules(docId)),
      [cardId]: schedule,
    };
    try {
      localStorage.setItem(PREFIX + docId, JSON.stringify(schedules));
    } catch {
      showToast('Could not save flashcard progress on this device', { tone: 'error' });
    }
    set({ docId, schedules });
  },
}));
