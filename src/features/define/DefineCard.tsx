import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { isEditableTarget } from '@/lib/util';
import { matches } from '../commands/keys';
import { placePeek, type Box, type PeekSide } from '../reader/linkPeekGeometry';
import { closeDefinition, type Lookup, lookUp, lookUpSelection, useDefineStore } from './defineStore';
import './define.css';

/** Keeps the card this far inside the document area. */
const BOUNDS_INSET = 8;

/**
 * A dictionary card for the selected word: select a word or short phrase and press `D`
 * (or Define in the selection toolbar). Mount once in the reader.
 */
export function DefineCard() {
  useDefineShortcut();
  const term = useDefineStore((s) => s.term);
  const anchor = useDefineStore((s) => s.anchor);
  const lookup = useDefineStore((s) => s.lookup);
  if (!term || !anchor) return null;
  return createPortal(<Card term={term} anchor={anchor} lookup={lookup} />, document.body);
}

/** `D` looks up the selected text. It does nothing (and swallows nothing) without a selection, or while typing. */
function useDefineShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !matches(event, 'define')) return;
      if (isEditableTarget(event.target) || document.querySelector('dialog:modal')) return;
      if (lookUpSelection()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function Card({ term, anchor, lookup }: { term: string; anchor: Box; lookup: Lookup }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<PeekSide>('below');

  // Take focus so the card's links are next in the tab order; Esc hands it back.
  useEffect(() => {
    const card = cardRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Esc closes only the card, not focus mode or the Return pill too.
      event.preventDefault();
      const hadFocus = !!card?.contains(document.activeElement);
      closeDefinition();
      if (hadFocus) previous?.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!card?.contains(event.target as Node)) closeDefinition();
    };
    const onScroll = (event: Event) => {
      if (!card?.contains(event.target as Node)) closeDefinition();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', closeDefinition);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeDefinition);
    };
  }, []);

  // Following "plural of vector" removes the focused button; keep focus in the card.
  useEffect(() => {
    const card = cardRef.current;
    if (term && card && !card.contains(document.activeElement)) card.focus({ preventScroll: true });
  }, [term]);

  // Beside the selection, against the card's current size (it grows when the entry arrives).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const viewport = document.querySelector('.reader__viewport')?.getBoundingClientRect();
    const placement = placePeek(
      anchor,
      { width: card.offsetWidth, height: card.offsetHeight },
      {
        top: Math.max(viewport?.top ?? 0, 0) + BOUNDS_INSET,
        left: Math.max(viewport?.left ?? 0, 0) + BOUNDS_INSET,
        bottom: Math.min(viewport?.bottom ?? Infinity, window.innerHeight) - BOUNDS_INSET,
        right: Math.min(viewport?.right ?? Infinity, window.innerWidth) - BOUNDS_INSET,
      },
      { prefer: sideRef.current },
    );
    sideRef.current = placement.side;
    card.style.top = `${placement.top}px`;
    card.style.left = `${placement.left}px`;
    card.dataset.side = placement.side;
  });

  const entry = lookup.status === 'found' ? lookup.entry : null;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`Definition of ${term}`}
      aria-busy={lookup.status === 'loading'}
      className="define-card"
      tabIndex={-1}
    >
      <h2 className="define-card__term">{term}</h2>
      <div className="define-card__body" aria-live="polite">
        {lookup.status === 'loading' && <p className="define-card__status">Looking up…</p>}
        {lookup.status === 'not-found' && <p className="define-card__status">No dictionary entry found.</p>}
        {lookup.status === 'unavailable' && (
          <p className="define-card__status">Couldn’t reach the dictionary. Check your connection.</p>
        )}
        {entry?.language && <p className="define-card__status">No English entry. In {entry.language}:</p>}
        {entry?.parts.map((part, index) => (
          // Wiktionary repeats a part of speech for each etymology, so position is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: the list is replaced whole, never reordered
          <section key={index} className="define-card__part">
            {part.partOfSpeech && <h3 className="define-card__pos">{part.partOfSpeech}</h3>}
            <ol className="define-card__senses">
              {part.senses.map((sense, senseIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                <li key={senseIndex}>
                  {sense.formOf ? <FormOf text={sense.text} word={sense.formOf} /> : sense.text}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      {entry && (
        <a className="define-card__source" href={entry.url} target="_blank" rel="noopener noreferrer">
          Wiktionary
          <ExternalLink aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

/** "plural of vector", with the base word as a button that looks it up in this card. */
function FormOf({ text, word }: { text: string; word: string }) {
  const at = text.lastIndexOf(word);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <button type="button" className="define-card__word" onClick={() => lookUp(word)}>
        {word}
      </button>
      {text.slice(at + word.length)}
    </>
  );
}
