/**
 * The read-aloud engine: a small zustand store plus the speech machinery.
 * One utterance per sentence; at the end of a page the next page's text is
 * extracted on demand. Without a system voice a timer drives the same flow.
 */
import { create } from 'zustand';
import { showToast } from '@/components/Toast';
import { useReaderStore } from '@/features/reader/readerStore';
import { rangeRects, type PageRect } from '@/features/search/pageText';
import { clamp } from '@/lib/util';
import { loadPageSpeech, type PageSpeech } from './pageSpeech';
import { estimateDurationMs, firstSentenceAtOrAfter, sentenceAtOrAfterPoint, wordRangeAt } from './sentences';
import { listVoices, pickVoice, synthesis } from './voices';

export type PlayerStatus = 'idle' | 'playing' | 'paused';

export const RATES = [0.8, 1, 1.25, 1.5, 1.75, 2] as const;
export const MIN_RATE = RATES[0];
export const MAX_RATE = RATES[RATES.length - 1];

const RATE_KEY = 'scriptorium.exp.read-aloud.rate';
const VOICE_KEY = 'scriptorium.exp.read-aloud.voice';
/** Without a `start` event this soon after `speak()`, the voice is not really working. */
const START_TIMEOUT_MS = 8000;
/** Pages without text in a row before reading gives up. */
const MAX_EMPTY_PAGES = 20;
/** Manual scrolling pauses follow-along for this long. */
export const FOLLOW_RESUME_MS = 5000;

export interface Highlight {
  /** Changes with every sentence, so the highlight can animate in again. */
  key: number;
  page: number;
  /** The sentence being read, as page fractions. */
  rects: PageRect[];
  /** The word being read, when known. */
  words: PageRect[];
}

interface PlayerState {
  status: PlayerStatus;
  /** Current position; sentence `index` of `count` on `page`. */
  page: number;
  index: number;
  count: number;
  highlight: Highlight | null;
  /** True while the page text is being fetched. */
  loading: boolean;
  /** No usable system voice: a timer stands in for speech. */
  simulated: boolean;
  /** False for a few seconds after the reader scrolls by hand. */
  following: boolean;
  rate: number;
  voiceName: string | null;

  toggle(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  next(): void;
  prev(): void;
  setRate(rate: number): void;
  cycleRate(): void;
  setVoice(name: string | null): void;
  setFollowing(following: boolean): void;
  /** The reader scrolled by hand: stop following for a moment. */
  userScrolled(): void;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Preferences are a nicety; private mode may refuse them.
  }
}

function storedRate(): number {
  const rate = Number.parseFloat(readStored(RATE_KEY) ?? '');
  return Number.isFinite(rate) ? clamp(rate, MIN_RATE, MAX_RATE) : 1;
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  status: 'idle',
  page: 0,
  index: 0,
  count: 0,
  highlight: null,
  loading: false,
  simulated: false,
  following: true,
  rate: storedRate(),
  voiceName: readStored(VOICE_KEY),

  toggle() {
    const { status } = get();
    if (status === 'idle') void startFromViewport();
    else if (status === 'playing') get().pause();
    else get().resume();
  },

  pause() {
    if (get().status !== 'playing') return;
    generation++;
    silence();
    set({ status: 'paused', loading: false });
  },

  resume() {
    const { status, page, index } = get();
    if (status !== 'paused') return;
    if (page < 1) void startFromViewport();
    else void playFrom(page, index);
  },

  stop() {
    stopNow();
  },

  next() {
    const { status, page, index, count } = get();
    if (status === 'idle') return;
    const speak = status === 'playing';
    if (index + 1 < count) void playFrom(page, index + 1, { speak });
    else void playFrom(page + 1, 0, { speak });
  },

  prev() {
    const { status, page, index } = get();
    if (status === 'idle') return;
    const speak = status === 'playing';
    if (index > 0) void playFrom(page, index - 1, { speak });
    else void playFrom(page - 1, Number.POSITIVE_INFINITY, { speak, backwards: true });
  },

  setRate(rate) {
    const next = clamp(rate, MIN_RATE, MAX_RATE);
    writeStored(RATE_KEY, String(next));
    set({ rate: next });
    restartSentence();
  },

  cycleRate() {
    const { rate } = get();
    const next = RATES.find((r) => r > rate + 0.001) ?? RATES[0];
    get().setRate(next);
  },

  setVoice(name) {
    writeStored(VOICE_KEY, name);
    voiceBroken = false;
    set({ voiceName: name, simulated: noVoice() });
    restartSentence();
  },

  setFollowing(following) {
    clearTimeout(followTimer);
    set({ following });
  },

  userScrolled() {
    if (get().status === 'idle') return;
    clearTimeout(followTimer);
    set({ following: false });
    followTimer = window.setTimeout(() => set({ following: true }), FOLLOW_RESUME_MS);
  },
}));

// ------------------------------------------------------------------ engine

/** Bumped whenever playback is redirected, so callbacks from older work are ignored. */
let generation = 0;
/** Pages whose text has been extracted, so the next sentence can be queued without waiting. */
const readyPages = new Map<number, PageSpeech>();
/** A sentence already handed to the speech engine while the one before it is still playing. */
let queued: { speech: PageSpeech; index: number } | null = null;
/** Held so the browser cannot garbage-collect an utterance before its events fire. */
let spoken: SpeechSynthesisUtterance[] = [];
let highlightKey = 0;
let simTimer = 0;
let startWatch = 0;
let endWatch = 0;
let followTimer = 0;
let lastCancel = 0;
/** Set once the engine proved silent, so later sessions simulate straight away (until another voice is chosen). */
let voiceBroken = false;

/** Stops sound and timers (not the state). */
function silence(): void {
  clearTimeout(simTimer);
  clearTimeout(startWatch);
  clearTimeout(endWatch);
  for (const u of spoken) {
    // Detach first: cancelling fires events that must not move the playback on.
    u.onstart = u.onboundary = u.onend = u.onerror = null;
  }
  spoken = [];
  queued = null;
  const synth = synthesis();
  if (synth && (synth.speaking || synth.pending || synth.paused)) {
    synth.cancel();
    lastCancel = performance.now();
  }
}

function stopNow(): void {
  generation++;
  silence();
  readyPages.clear();
  clearTimeout(followTimer);
  usePlayer.setState({
    status: 'idle',
    page: 0,
    index: 0,
    count: 0,
    highlight: null,
    loading: false,
    following: true,
  });
}

function restartSentence(): void {
  const { status, page, index } = usePlayer.getState();
  if (status === 'playing' && page > 0) void playFrom(page, index);
}

/** Whether the next play session has to be simulated: no speech engine, no voices installed, or a voice that stayed silent. */
function noVoice(): boolean {
  return voiceBroken || !synthesis() || listVoices().length === 0;
}

/** Makes `index` of `loaded` the sentence shown and highlighted. */
function enter(loaded: PageSpeech, index: number): void {
  readyPages.set(loaded.page, loaded);
  for (const page of readyPages.keys()) {
    if (Math.abs(page - loaded.page) > 3) readyPages.delete(page);
  }
  const state = usePlayer.getState();
  if (state.page === loaded.page && state.index === index && state.highlight) return;
  usePlayer.setState({
    page: loaded.page,
    index,
    count: loaded.sentences.length,
    highlight: { key: ++highlightKey, page: loaded.page, rects: loaded.sentences[index].rects, words: [] },
  });
}

interface PlayOptions {
  /** Count `index` from the end of the page's sentences (`Infinity` is the last one). */
  backwards?: boolean;
  /** False moves the highlight without speaking (stepping while paused). */
  speak?: boolean;
}

/** Moves to a sentence (skipping pages without text) and starts speaking it. */
async function playFrom(startPage: number, startIndex: number, options: PlayOptions = {}): Promise<void> {
  const speak = options.speak ?? true;
  let backwards = options.backwards ?? false;
  const gen = ++generation;
  silence();
  const { pdf, docId } = useReaderStore.getState();
  if (!pdf || !docId) {
    stopNow();
    return;
  }
  let page = startPage;
  let index = startIndex;
  usePlayer.setState({ status: speak ? 'playing' : 'paused', loading: true });

  let empty = 0;
  let loaded: PageSpeech;
  for (;;) {
    if (page > pdf.numPages) {
      if (gen === generation) {
        stopNow();
        showToast('Reached the end of the book.');
      }
      return;
    }
    if (page < 1) {
      page = 1;
      index = 0;
      backwards = false;
    }
    try {
      loaded = readyPages.get(page) ?? (await loadPageSpeech(pdf, docId, page));
    } catch {
      if (gen === generation) stopNow();
      return;
    }
    if (gen !== generation) return;
    readyPages.set(page, loaded);
    const last = loaded.sentences.length - 1;
    if (last >= 0 && (backwards || index <= last)) break;
    if (++empty > MAX_EMPTY_PAGES) {
      stopNow();
      showToast('No readable text found on these pages.', { tone: 'error' });
      return;
    }
    page += backwards ? -1 : 1;
    index = backwards ? Number.POSITIVE_INFINITY : 0;
  }

  index = clamp(index, 0, loaded.sentences.length - 1);
  usePlayer.setState({ status: speak ? 'playing' : 'paused', loading: false });
  enter(loaded, index);
  if (page < pdf.numPages) {
    loadPageSpeech(pdf, docId, page + 1).then(
      (next) => {
        if (gen === generation) readyPages.set(next.page, next);
      },
      () => {},
    );
  }
  if (speak) speakSentence(gen, loaded, index);
}

function advance(gen: number): void {
  if (gen !== generation) return;
  const { page, index, count } = usePlayer.getState();
  if (index + 1 < count) void playFrom(page, index + 1);
  else void playFrom(page + 1, 0);
}

function speakSentence(gen: number, loaded: PageSpeech, index: number): void {
  const synth = synthesis();
  if (usePlayer.getState().simulated || !synth) {
    simulate(gen, loaded, index);
    return;
  }
  const u = makeUtterance(gen, loaded, index);
  spoken = [u];
  // Chrome drops a speak() that follows cancel() too closely.
  const speakNow = () => {
    if (gen !== generation) return;
    synth.speak(u);
    startWatch = window.setTimeout(() => fallBackToSimulation(gen, loaded, index), START_TIMEOUT_MS);
  };
  if (performance.now() - lastCancel < 120) window.setTimeout(speakNow, 80);
  else speakNow();
}

/**
 * One utterance per sentence. When it starts, the next sentence is handed to the
 * engine straight away so the voice does not pause between sentences, and the
 * highlight moves on as each utterance actually begins.
 */
function makeUtterance(gen: number, loaded: PageSpeech, index: number): SpeechSynthesisUtterance {
  const sentence = loaded.sentences[index];
  const { rate, voiceName } = usePlayer.getState();
  const u = new SpeechSynthesisUtterance(sentence.text);
  const voice = pickVoice(listVoices(), voiceName);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = rate;

  u.onstart = () => {
    if (gen !== generation) return;
    clearTimeout(startWatch);
    clearTimeout(endWatch);
    if (queued?.speech === loaded && queued.index === index) queued = null;
    enter(loaded, index);
    // Some engines never report the end of an utterance; do not stall forever.
    endWatch = window.setTimeout(() => advance(gen), estimateDurationMs(sentence.text, rate) * 3 + 5000);
    queueAhead(gen, loaded, index);
  };
  u.onboundary = (event) => {
    if (gen !== generation || (event.name && event.name !== 'word')) return;
    const { charLength } = event as SpeechSynthesisEvent & { charLength?: number };
    showWord(loaded, index, event.charIndex, charLength);
  };
  u.onend = () => {
    if (gen !== generation) return;
    // The next utterance may already have started (and moved the position on).
    const position = usePlayer.getState();
    if (position.page !== loaded.page || position.index !== index) return;
    clearTimeout(endWatch);
    if (queued) {
      // The next sentence is with the engine already; make sure it really starts.
      startWatch = window.setTimeout(() => advance(gen), START_TIMEOUT_MS);
      return;
    }
    advance(gen);
  };
  u.onerror = (event) => {
    if (gen !== generation || event.error === 'canceled' || event.error === 'interrupted') return;
    fallBackToSimulation(gen, loaded, index);
  };
  return u;
}

/** The sentence after (`loaded`, `index`), if its text is already extracted. */
function peekNext(loaded: PageSpeech, index: number): { speech: PageSpeech; index: number } | null {
  if (index + 1 < loaded.sentences.length) return { speech: loaded, index: index + 1 };
  const next = readyPages.get(loaded.page + 1);
  return next && next.sentences.length > 0 ? { speech: next, index: 0 } : null;
}

function queueAhead(gen: number, loaded: PageSpeech, index: number): void {
  const synth = synthesis();
  const next = peekNext(loaded, index);
  if (queued || !synth || !next) return;
  const u = makeUtterance(gen, next.speech, next.index);
  queued = next;
  spoken = [...spoken.slice(-2), u];
  synth.speak(u);
}

function fallBackToSimulation(gen: number, loaded: PageSpeech, index: number): void {
  if (gen !== generation) return;
  silence();
  voiceBroken = true;
  usePlayer.setState({ simulated: true });
  simulate(gen, loaded, index);
}

/** Timer-driven stand-in for speech: ≈ 180 words per minute, with the word highlight following along. */
function simulate(gen: number, loaded: PageSpeech, index: number): void {
  enter(loaded, index);
  const { text } = loaded.sentences[index];
  const total = estimateDurationMs(text, usePlayer.getState().rate);
  const began = performance.now();
  let lastWord = -1;
  const tick = () => {
    if (gen !== generation) return;
    const elapsed = performance.now() - began;
    if (elapsed >= total) {
      advance(gen);
      return;
    }
    const range = wordRangeAt(text, Math.floor((elapsed / total) * text.length));
    if (range && range.start !== lastWord) {
      lastWord = range.start;
      showWord(loaded, index, range.start, range.end - range.start);
    }
    simTimer = window.setTimeout(tick, Math.min(110, total - elapsed));
  };
  tick();
}

function showWord(loaded: PageSpeech, index: number, charIndex: number, charLength?: number): void {
  const sentence = loaded.sentences[index];
  const word = wordRangeAt(sentence.text, charIndex, charLength);
  if (!word) return;
  const words = rangeRects(loaded.pageText, sentence.start + word.start, sentence.start + word.end);
  usePlayer.setState((state) =>
    state.highlight && state.page === loaded.page && state.index === index
      ? { highlight: { ...state.highlight, words } }
      : state,
  );
}

// ------------------------------------------------------------------- start

interface StartPoint {
  page: number;
  /** Viewport-top offset (page fraction) when starting from the scroll position. */
  offset: number;
  /** Selection start (page fractions) when "reading from here". */
  point?: { x: number; y: number };
}

/** The start of the text selection, when it lies on a page. */
function selectionStart(): StartPoint | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const sheet = element?.closest<HTMLElement>('.page-sheet[data-page]');
  if (!sheet) return null;
  const box = sheet.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  const y = (rect.top + rect.height / 2 - box.top) / box.height;
  return {
    page: Number(sheet.dataset.page),
    offset: y,
    point: { x: (rect.left - box.left) / box.width, y },
  };
}

/** Starts at the selection, or at the first sentence at or below the top of the viewport. */
async function startFromViewport(): Promise<void> {
  const reader = useReaderStore.getState();
  const { pdf, docId } = reader;
  if (!pdf || !docId) return;
  const gen = ++generation;
  silence();
  usePlayer.setState({ status: 'playing', loading: true, simulated: noVoice(), following: true });

  const { page, offset } = reader.controller?.getLocation() ?? reader.location;
  const start: StartPoint = selectionStart() ?? { page, offset };
  let loaded: PageSpeech;
  try {
    loaded = await loadPageSpeech(pdf, docId, start.page);
  } catch {
    if (gen === generation) stopNow();
    return;
  }
  if (gen !== generation) return;
  const index = start.point
    ? sentenceAtOrAfterPoint(loaded.sentences, start.point.x, start.point.y)
    : firstSentenceAtOrAfter(loaded.sentences, start.offset);
  await playFrom(start.page, index);
}

/** Restarts the current sentence if the tab comes back and the engine has gone quiet. */
export function recoverSpeech(): void {
  const { status, simulated, page, index, loading } = usePlayer.getState();
  const synth = synthesis();
  if (status !== 'playing' || simulated || loading || !synth) return;
  if (synth.paused) synth.resume();
  else if (!synth.speaking && !synth.pending && page > 0) void playFrom(page, index);
}
