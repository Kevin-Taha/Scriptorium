import { useEffect, useId, useRef, useState } from 'react';
import { AudioLines, LocateFixed, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { formatPageRef } from '@/features/navigation/pageLabels';
import { useReaderStore } from '@/features/reader/readerStore';
import { scrollToHighlight } from './follow';
import { usePlayer } from './player';
import { useVoices } from './voices';
import './readAloud.css';

function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

/** What a screen reader hears: only changes of state and page, never every sentence. */
function useAnnouncement(): string {
  const status = usePlayer((s) => s.status);
  const page = usePlayer((s) => s.page);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (status === 'idle') setMessage('Read aloud stopped');
    else if (status === 'paused') setMessage('Read aloud paused');
    else setMessage(page > 0 ? `Reading ${formatPageRef(pageLabels, page)}` : 'Read aloud started');
  }, [status, page, pageLabels]);
  return message;
}

function VoiceMenu() {
  const voices = useVoices();
  const voiceName = usePlayer((s) => s.voiceName);
  const setVoice = usePlayer((s) => s.setVoice);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const unavailable = voices.length === 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    // Esc closes the popover only; it must not also stop the reading.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const selected = voices.some((v) => v.name === voiceName) ? (voiceName ?? '') : '';

  return (
    <div className="ra-voice" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ra-btn tooltip tooltip--below"
        data-tooltip={unavailable ? 'No system voices' : 'Voice'}
        aria-label="Voice"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={unavailable}
        onClick={() => setOpen((v) => !v)}
      >
        <AudioLines aria-hidden="true" />
      </button>
      {open && (
        <div className="ra-popover" id={id} role="dialog" aria-label="Voice">
          <label className="ra-popover__label" htmlFor={`${id}-select`}>
            Voice
          </label>
          <select
            id={`${id}-select`}
            className="input input--sm ra-popover__select"
            value={selected}
            onChange={(event) => setVoice(event.target.value || null)}
          >
            <option value="">System default</option>
            {voices.map((voice) => (
              <option key={`${voice.name}|${voice.lang}`} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** Floating transport at the top-right of the reading area while read-aloud is active. */
export function MiniPlayer() {
  const status = usePlayer((s) => s.status);
  const page = usePlayer((s) => s.page);
  const index = usePlayer((s) => s.index);
  const count = usePlayer((s) => s.count);
  const rate = usePlayer((s) => s.rate);
  const simulated = usePlayer((s) => s.simulated);
  const following = usePlayer((s) => s.following);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const announcement = useAnnouncement();
  if (status === 'idle') return null;

  const playing = status === 'playing';
  const { toggle, prev, next, cycleRate, stop, setFollowing } = usePlayer.getState();
  const position =
    page > 0 && count > 0 ? `${formatPageRef(pageLabels, page)} · ${index + 1}/${count}` : 'Loading…';

  return (
    <div className="ra-region">
      <div className="ra-player" role="group" aria-label="Read aloud">
        <button
          type="button"
          className="ra-btn ra-btn--primary tooltip tooltip--below"
          data-tooltip={playing ? 'Pause (Shift+A)' : 'Play (Shift+A)'}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={toggle}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="ra-btn tooltip tooltip--below"
          data-tooltip="Previous sentence"
          aria-label="Previous sentence"
          onClick={prev}
        >
          <SkipBack aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ra-btn tooltip tooltip--below"
          data-tooltip="Next sentence"
          aria-label="Next sentence"
          onClick={next}
        >
          <SkipForward aria-hidden="true" />
        </button>
        <span className="ra-player__position">{position}</span>
        <button
          type="button"
          className="ra-btn ra-btn--text tooltip tooltip--below"
          data-tooltip="Speed"
          aria-label={`Reading speed ${formatRate(rate)}. Change`}
          onClick={cycleRate}
        >
          {formatRate(rate)}
        </button>
        <VoiceMenu />
        <button
          type="button"
          className="ra-btn tooltip tooltip--below"
          data-tooltip="Stop (Esc)"
          aria-label="Stop reading"
          onClick={stop}
        >
          <X aria-hidden="true" />
        </button>
        <span className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </span>
      </div>
      {!following && (
        <button
          type="button"
          className="ra-chip ra-chip--action"
          onClick={() => {
            setFollowing(true);
            scrollToHighlight();
          }}
        >
          <LocateFixed aria-hidden="true" />
          Follow
        </button>
      )}
      {simulated && <span className="ra-chip">No system voice — simulating</span>}
    </div>
  );
}
