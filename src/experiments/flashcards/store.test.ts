import { beforeEach, describe, expect, it } from 'vitest';
import { useFlashcardStore } from './store';

describe('flashcard storage', () => {
  beforeEach(() => {
    localStorage.clear();
    useFlashcardStore.setState({ docId: null, schedules: {} });
  });

  it('saves per book and reloads schedules without leaking into other books', () => {
    const state = { due: 123, interval: 60_000, ease: 2.5, learning: true };
    useFlashcardStore.getState().load('book-a');
    useFlashcardStore.getState().save('book-a', 'note:qa:hash', state);
    expect(JSON.parse(localStorage.getItem('scriptorium.exp.flashcards.book-a') ?? '{}')).toEqual({
      'note:qa:hash': state,
    });
    useFlashcardStore.getState().load('book-b');
    expect(useFlashcardStore.getState().schedules).toEqual({});
    useFlashcardStore.getState().load('book-a');
    expect(useFlashcardStore.getState().schedules['note:qa:hash']).toEqual(state);
  });

  it('ignores malformed storage and invalid schedules', () => {
    localStorage.setItem('scriptorium.exp.flashcards.bad', '{');
    useFlashcardStore.getState().load('bad');
    expect(useFlashcardStore.getState().schedules).toEqual({});
    localStorage.setItem(
      'scriptorium.exp.flashcards.other',
      JSON.stringify({ broken: { due: 'soon' }, valid: { due: 1, interval: 10, ease: 2, learning: false } }),
    );
    useFlashcardStore.getState().load('other');
    expect(Object.keys(useFlashcardStore.getState().schedules)).toEqual(['valid']);
  });
});
