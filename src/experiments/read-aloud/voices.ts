import { useEffect, useState } from 'react';

/** The system speech engine, or null where the Web Speech API is missing. */
export function synthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return null;
  return 'speechSynthesis' in window ? (window.speechSynthesis ?? null) : null;
}

export function listVoices(): SpeechSynthesisVoice[] {
  try {
    return synthesis()?.getVoices() ?? [];
  } catch {
    return [];
  }
}

function languageOf(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0];
}

/**
 * The saved voice if it is still installed; otherwise the system default for
 * the interface language, any voice in that language, or null (the browser's own default).
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  savedName: string | null,
  language = typeof navigator === 'undefined' ? 'en' : navigator.language,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const saved = savedName ? voices.find((v) => v.name === savedName) : undefined;
  if (saved) return saved;
  const base = languageOf(language);
  const matching = voices.filter((v) => languageOf(v.lang) === base);
  return matching.find((v) => v.default) ?? matching[0] ?? voices.find((v) => v.default) ?? null;
}

/** Installed voices, kept current as the browser loads them. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices);
  useEffect(() => {
    const synth = synthesis();
    if (!synth) return;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener?.('voiceschanged', update);
    return () => synth.removeEventListener?.('voiceschanged', update);
  }, []);
  return voices;
}
