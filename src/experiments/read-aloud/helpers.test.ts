import { describe, expect, it } from 'vitest';
import { locationFromPagePx } from './follow';
import { pickVoice } from './voices';

const voice = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, default: isDefault, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

describe('pickVoice', () => {
  const voices = [voice('Hans', 'de-DE', true), voice('Ada', 'en-GB'), voice('Sam', 'en-US')];

  it('prefers the saved voice while it is installed', () => {
    expect(pickVoice(voices, 'Sam', 'de-DE')?.name).toBe('Sam');
  });

  it('falls back to a voice in the interface language, preferring the system default', () => {
    expect(pickVoice(voices, 'Gone', 'en-US')?.name).toBe('Ada');
    expect(pickVoice([...voices, voice('Zoe', 'en-US', true)], null, 'en-US')?.name).toBe('Zoe');
  });

  it('uses the system default when no voice matches the language, and null when there are none', () => {
    expect(pickVoice(voices, null, 'fr-FR')?.name).toBe('Hans');
    expect(pickVoice([], null, 'en-US')).toBeNull();
  });
});

describe('locationFromPagePx', () => {
  const sizes: Record<number, { width: number; height: number }> = {
    1: { width: 600, height: 800 },
    2: { width: 600, height: 1000 },
    3: { width: 600, height: 1000 },
  };
  const controller = { getPageSize: (page: number) => sizes[page] ?? null };

  it('maps a point inside the page to its offset', () => {
    expect(locationFromPagePx(controller, 2, 250, 24)).toEqual({ page: 2, offset: 0.25 });
  });

  it('walks into the page above for a point above the top, counting the gap between pages', () => {
    const location = locationFromPagePx(controller, 2, -224, 24);
    expect(location.page).toBe(1);
    expect(location.offset).toBeCloseTo((800 + 24 - 224) / 800, 6);
  });

  it('stops at the first page', () => {
    expect(locationFromPagePx(controller, 1, -100, 24)).toEqual({ page: 1, offset: -100 / 800 });
  });
});
