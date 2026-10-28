import type { ComponentType } from 'react';

export interface PageSlotProps {
  page: number;
  size: { width: number; height: number };
}

/**
 * What an experiment plugs into. Every component is optional and is only
 * mounted while the experiment is switched on, each inside its own error
 * boundary so a broken prototype can't take the app down.
 */
export interface ExperimentModule {
  /** Mounted once in the app shell on every screen (global shortcuts, dialogs). */
  App?: ComponentType;
  /** Mounted once inside the reader's document area (`.reader__main`, position: relative). */
  Reader?: ComponentType;
  /** Buttons in the reader toolbar, just before the Appearance button. */
  ReaderToolbar?: ComponentType;
  /** Absolutely positioned along the bottom edge of the reader toolbar (position: relative). */
  ReaderToolbarStrip?: ComponentType;
  /** Layered over each rendered page sheet, like highlights and note markers. */
  PageOverlay?: ComponentType<PageSlotProps>;
  /** Shown in the library between the header and the books. */
  Library?: ComponentType;
  /** Buttons in the collated notes review toolbar, before the export button. */
  ReviewToolbar?: ComponentType;
}
