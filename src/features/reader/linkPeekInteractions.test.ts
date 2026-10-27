import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE_DELAY_MS, DWELL_MS, PeekInteractions, type Peek } from './linkPeekInteractions';

let viewport: HTMLElement;
let a: HTMLAnchorElement;
let b: HTMLAnchorElement;
let text: HTMLElement;
let card: HTMLElement;
let shown: Peek | null;
let history: (string | null)[];
let interactions: PeekInteractions;
let disconnect: () => void;

const linkName = (peek: Peek | null) => peek?.link.textContent ?? null;
const pointer = (type: string, target: Element, relatedTarget: Element | null = null) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', relatedTarget }));
const move = (target: Element) => pointer('pointermove', target);
/** The pointer crosses from one element to another. */
const cross = (from: Element, to: Element) => {
  pointer('pointerout', from, to);
  move(to);
};
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

async function openOn(link: HTMLAnchorElement) {
  move(link);
  await wait(DWELL_MS);
  expect(linkName(shown)).toBe(link.textContent);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <div class="viewport" tabindex="0">
      <span class="text">see Figures</span>
      <a class="page-sheet__link" data-link="internal" data-page="7" href="#">A</a>
      <a class="page-sheet__link" data-link="internal" data-page="8" href="#">B</a>
    </div>
    <div class="card"><button>Go to</button></div>`;
  viewport = document.querySelector('.viewport')!;
  [a, b] = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
  text = document.querySelector('.text')!;
  card = document.querySelector('.card')!;
  shown = null;
  history = [];
  interactions = new PeekInteractions(
    viewport,
    () => (shown ? card : null),
    (peek) => {
      shown = peek;
      history.push(linkName(peek));
    },
    (link) => Promise.resolve({ page: Number((link as HTMLElement).dataset.page), offset: 0 }),
  );
  disconnect = interactions.connect();
});

afterEach(() => {
  disconnect();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('PeekInteractions', () => {
  it('opens a peek only after the pointer dwells on a link', async () => {
    move(a);
    await wait(DWELL_MS - 1);
    expect(shown).toBeNull();
    await wait(1);
    expect(shown).toMatchObject({ via: 'pointer', target: { page: 7, offset: 0 } });
  });

  it('does nothing when the pointer merely passes over a link', async () => {
    move(a);
    cross(a, text);
    await wait(DWELL_MS * 3);
    expect(history).toEqual([]);
  });

  it('closes after a short grace period once the pointer leaves', async () => {
    await openOn(a);
    cross(a, text);
    await wait(CLOSE_DELAY_MS - 1);
    expect(linkName(shown)).toBe('A');
    await wait(1);
    expect(shown).toBeNull();
  });

  it('stays open while the pointer is on the card', async () => {
    await openOn(a);
    pointer('pointerout', a, card);
    interactions.cardEnter();
    await wait(CLOSE_DELAY_MS * 5);
    expect(linkName(shown)).toBe('A');
    interactions.cardLeave();
    await wait(CLOSE_DELAY_MS);
    expect(shown).toBeNull();
  });

  it('switches straight to a neighbouring link the pointer rests on', async () => {
    await openOn(a);
    cross(a, b); // a single move onto B, then the pointer rests
    await wait(CLOSE_DELAY_MS);
    expect(linkName(shown)).toBe('A');
    await wait(DWELL_MS - CLOSE_DELAY_MS);
    expect(linkName(shown)).toBe('B');
    expect(history).toEqual(['A', 'B']);
  });

  it('closes when the pointer leaves the neighbour before its dwell', async () => {
    await openOn(a);
    cross(a, b);
    cross(b, text);
    await wait(CLOSE_DELAY_MS);
    expect(shown).toBeNull();
    await wait(DWELL_MS * 2);
    expect(history).toEqual(['A', null]);
  });

  it('keeps the peek when the pointer returns from the neighbour', async () => {
    await openOn(a);
    cross(a, b);
    cross(b, a);
    await wait(DWELL_MS * 3);
    expect(history).toEqual(['A']);
  });

  it('Escape dismisses the peek and abandons a pending dwell', async () => {
    await openOn(a);
    cross(a, b);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shown).toBeNull();
    await wait(DWELL_MS * 2);
    expect(history).toEqual(['A', null]);
  });

  it('opens immediately with Space on a focused link and toggles closed', async () => {
    a.focus();
    a.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await wait(0);
    expect(shown).toMatchObject({ via: 'keyboard', target: { page: 7 } });
    a.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(shown).toBeNull();
  });
});
