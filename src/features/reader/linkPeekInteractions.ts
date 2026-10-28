import type { ReadingLocation } from '@/lib/types';
import { PEEK_PAGE_MAX_HEIGHT, PEEK_WIDTH } from './linkPeekGeometry';

/** Hover this long before a peek opens, so merely passing over links costs nothing. */
export const DWELL_MS = 350;
/** Grace period for moving the pointer between a link and its card. */
export const CLOSE_DELAY_MS = 200;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
const INTERNAL_LINK = 'a.page-sheet__link[data-link="internal"]';

export interface Peek {
  link: HTMLAnchorElement;
  target: ReadingLocation;
  /** Keyboard peeks follow focus, pointer peeks follow the pointer, touch peeks stay until dismissed. */
  via: 'pointer' | 'keyboard' | 'touch';
  /** Width of the page image, and the tallest whole-page view that fits the viewport. */
  width: number;
  maxPageHeight: number;
}

export type FocusAfterClose = 'link' | 'viewport' | 'none';

/** Destination of an internal link element, or null if it isn't one. */
export type LinkTargetResolver = (link: Element) => Promise<ReadingLocation | null> | null;

/**
 * Pointer, keyboard and touch handling for peeks. Delegated listeners on the
 * viewport mean links need no wiring of their own, and nothing runs until a
 * link is actually dwelt on.
 */
export class PeekInteractions {
  private current: Peek | null = null;
  private pending: HTMLAnchorElement | null = null;
  private dwellTimer = 0;
  private closeTimer = 0;
  private press: { link: HTMLAnchorElement; x: number; y: number; timer: number } | null = null;
  private suppressClick = false;
  private openToken = 0;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly card: () => HTMLElement | null,
    private readonly onChange: (peek: Peek | null) => void,
    private readonly resolveTarget: LinkTargetResolver,
  ) {}

  connect(): () => void {
    const listeners = new AbortController();
    const { signal } = listeners;
    this.viewport.addEventListener('pointermove', this.onPointerMove, { signal });
    this.viewport.addEventListener('pointerout', this.onPointerOut, { signal });
    this.viewport.addEventListener('click', this.onClick, { signal, capture: true });
    this.viewport.addEventListener('contextmenu', this.onContextMenu, { signal });
    this.viewport.addEventListener('scroll', this.onScroll, { signal, passive: true });
    document.addEventListener('pointerdown', this.onPointerDown, { signal, capture: true });
    document.addEventListener('pointerup', this.cancelPress, { signal, capture: true });
    document.addEventListener('pointercancel', this.cancelPress, { signal, capture: true });
    document.addEventListener('keydown', this.onKeyDown, { signal, capture: true });
    document.addEventListener('focusout', this.onFocusOut, { signal });
    window.addEventListener('resize', () => this.close('none'), { signal });
    return () => {
      listeners.abort();
      this.close('none');
    };
  }

  cardEnter(): void {
    this.cancelClose();
  }

  cardLeave(): void {
    if (this.current?.via === 'pointer') this.scheduleClose();
  }

  async open(link: HTMLAnchorElement, via: Peek['via']): Promise<void> {
    this.cancelDwell();
    this.cancelClose();
    const token = ++this.openToken;
    const target = await this.resolveTarget(link);
    if (token !== this.openToken || !target || !link.isConnected) return;
    const area = this.viewport.getBoundingClientRect();
    this.current = {
      link,
      target,
      via,
      width: Math.max(200, Math.min(PEEK_WIDTH, Math.floor(area.width) - 48)),
      maxPageHeight: Math.max(160, Math.min(PEEK_PAGE_MAX_HEIGHT, Math.floor(area.height) - 96)),
    };
    this.onChange(this.current);
  }

  /** Dismisses the peek and abandons any peek that was about to open. */
  close(focus: FocusAfterClose): void {
    this.openToken++;
    this.cancelDwell();
    this.cancelPress();
    this.hide(focus);
  }

  /** Hides the open peek only; a dwell or open already under way for another link carries on. */
  private hide(focus: FocusAfterClose): void {
    this.cancelClose();
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.onChange(null);
    if (focus === 'link' && current.link.isConnected) current.link.focus({ preventScroll: true });
    else if (focus === 'viewport') this.viewport.focus({ preventScroll: true, focusVisible: false });
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      const press = this.press;
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX) {
        this.cancelPress();
      }
      return;
    }
    // Movement (not pointerover) starts the dwell, so content scrolling under a
    // resting pointer never pops a peek open.
    const link = this.linkAt(event.target);
    if (!link) return;
    if (link === this.current?.link) {
      this.cancelClose();
    } else if (link !== this.pending) {
      // On a neighbouring link ("Figures 3.2 and 3.3") the open peek stays up
      // until the new one replaces it after the dwell.
      if (this.current?.via === 'pointer') this.cancelClose();
      this.startDwell(link);
    }
  };

  private readonly onPointerOut = (event: PointerEvent) => {
    const link = this.linkAt(event.target);
    if (!link || link.contains(event.relatedTarget as Node | null)) return;
    if (link === this.pending) this.cancelDwell();
    if (this.current?.via === 'pointer' && !this.current.link.contains(event.relatedTarget as Node | null)) {
      this.scheduleClose();
    }
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.cancelDwell();
    this.suppressClick = false;
    if (this.card()?.contains(event.target as Node)) return;
    const link = this.linkAt(event.target);
    if (this.current && link !== this.current.link) this.close('none');
    if (event.pointerType === 'touch' && link) this.startPress(link, event);
  };

  private readonly onClick = (event: MouseEvent) => {
    if (!this.linkAt(event.target)) return;
    if (this.suppressClick) {
      // The long press that opened this peek must not also follow the link.
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressClick = false;
      return;
    }
    this.close('none');
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    const link = this.linkAt(event.target);
    if (!link || !(this.press || this.current?.via === 'touch')) return;
    event.preventDefault();
    if (this.press?.link === link) this.firePress();
  };

  private readonly onScroll = () => {
    this.cancelDwell();
    this.cancelPress();
    if (this.current) this.close(this.focusInCard() ? 'link' : 'none');
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const current = this.current;
    if (current && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(this.focusInCard() || document.activeElement === current.link ? 'link' : 'none');
      return;
    }
    const link = this.linkAt(event.target);
    if (link && event.target === link && (event.key === ' ' || (event.key === 'Enter' && event.shiftKey))) {
      event.preventDefault();
      event.stopPropagation();
      if (current?.link === link) this.close('none');
      else void this.open(link, 'keyboard');
      return;
    }
    if (current && event.key === 'Tab') this.moveFocus(event, current);
  };

  /** Tab moves from the link into the card; leaving the card returns to the link. */
  private moveFocus(event: KeyboardEvent, current: Peek): void {
    const card = this.card();
    const controls = card ? Array.from(card.querySelectorAll<HTMLElement>('button:not(:disabled)')) : [];
    if (!card || controls.length === 0) return;
    if (event.target === current.link && !event.shiftKey) {
      event.preventDefault();
      controls[0].focus();
    } else if (event.shiftKey && event.target === controls[0]) {
      event.preventDefault();
      current.link.focus({ preventScroll: true });
    } else if (!event.shiftKey && event.target === controls.at(-1)) {
      event.preventDefault();
      this.close('link');
    }
  }

  private readonly onFocusOut = (event: FocusEvent) => {
    const current = this.current;
    if (current?.via !== 'keyboard') return;
    const next = event.relatedTarget as Node | null;
    if (next && (current.link.contains(next) || this.card()?.contains(next))) return;
    this.close('none');
  };

  private startDwell(link: HTMLAnchorElement): void {
    this.cancelDwell();
    this.pending = link;
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = 0;
      this.pending = null;
      void this.open(link, 'pointer');
    }, DWELL_MS);
  }

  private cancelDwell(): void {
    window.clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
    this.pending = null;
  }

  private scheduleClose(): void {
    if (this.closeTimer) return;
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = 0;
      this.hide(this.focusInCard() ? 'link' : 'none');
    }, CLOSE_DELAY_MS);
  }

  private cancelClose(): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = 0;
  }

  private startPress(link: HTMLAnchorElement, event: PointerEvent): void {
    this.cancelPress();
    const timer = window.setTimeout(() => this.firePress(), LONG_PRESS_MS);
    this.press = { link, x: event.clientX, y: event.clientY, timer };
  }

  private firePress(): void {
    const press = this.press;
    if (!press) return;
    this.cancelPress();
    this.suppressClick = true;
    void this.open(press.link, 'touch');
  }

  private readonly cancelPress = () => {
    if (!this.press) return;
    window.clearTimeout(this.press.timer);
    this.press = null;
  };

  private focusInCard(): boolean {
    return !!this.card()?.contains(document.activeElement);
  }

  private linkAt(target: EventTarget | null): HTMLAnchorElement | null {
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>(INTERNAL_LINK) : null;
    return link && this.viewport.contains(link) ? link : null;
  }
}
