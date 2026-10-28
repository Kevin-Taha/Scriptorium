import { emitExperimentEvent, EXPERIMENT_EVENTS, type PinPageDetail } from '../shared/events';
import type { ReadingLocation } from '@/lib/types';

const REFERENCE =
  /\b(?:Figs?\.?|Figures?|Tables?|Appendix|Eqs?\.?|Equations?|Sections?|Chapters?|Examples?|Problems?|Exercises?|Listings?)\s+(?:[A-Z][.\u2013-]?)?\d+(?:[.\u2013-]\d+)*[a-z]?/i;
const MAX_TITLE_LENGTH = 40;

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * What a link says ("Figure 1.1"): link annotations carry no text, so read the
 * text layer under the link and pick out the reference it names.
 */
export function linkTitle(link: HTMLElement): string | undefined {
  const layer = link.closest('.page-sheet')?.querySelector('.textLayer');
  if (!layer) return undefined;
  const box = link.getBoundingClientRect();
  const text = Array.from(layer.querySelectorAll('span'))
    .filter((span) => !span.querySelector('span') && overlaps(span.getBoundingClientRect(), box))
    .map((span) => span.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  const reference = REFERENCE.exec(text);
  if (reference) return reference[0];
  return text.length <= MAX_TITLE_LENGTH ? text : undefined;
}

/** Asks the pinned pane to pin a link's destination, named after the link. */
export function pinLinkDestination(link: HTMLElement, target: ReadingLocation): void {
  const detail: PinPageDetail = { location: target, title: linkTitle(link) };
  emitExperimentEvent(EXPERIMENT_EVENTS.pinPage, detail);
}
