import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeNearViewport } from './reviewViewport';

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin = '0px';
  readonly thresholds: readonly number[] = [0];

  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? '0px';
    MockIntersectionObserver.instances.push(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  emit(target: Element, isIntersecting: boolean): void {
    const rect = target.getBoundingClientRect();
    this.callback(
      [
        {
          target,
          isIntersecting,
          time: 0,
          boundingClientRect: rect,
          intersectionRect: rect,
          intersectionRatio: isIntersecting ? 1 : 0,
          rootBounds: null,
        },
      ],
      this,
    );
  }
}

afterEach(() => {
  MockIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('observeNearViewport', () => {
  it('shares observers only for the same root and preload margin', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const root = document.createElement('div');
    const first = document.createElement('div');
    const second = document.createElement('div');
    const thumbnail = document.createElement('div');
    const onPage = vi.fn();
    const onThumbnail = vi.fn();
    const stopFirst = observeNearViewport(first, root, 1200, onPage);
    const stopSecond = observeNearViewport(second, root, 1200, vi.fn());
    const stopThumbnail = observeNearViewport(thumbnail, root, 600, onThumbnail);
    const [pages, thumbnails] = MockIntersectionObserver.instances;

    expect(MockIntersectionObserver.instances).toHaveLength(2);
    expect(pages.options).toEqual({ root, rootMargin: '1200px 0px' });
    expect(thumbnails.options).toEqual({ root, rootMargin: '600px 0px' });
    expect(pages.observe).toHaveBeenCalledTimes(2);
    expect(thumbnails.observe).toHaveBeenCalledWith(thumbnail);
    pages.emit(first, true);
    thumbnails.emit(thumbnail, false);
    expect(onPage).toHaveBeenCalledExactlyOnceWith(true);
    expect(onThumbnail).toHaveBeenCalledExactlyOnceWith(false);

    stopFirst();
    expect(pages.unobserve).toHaveBeenCalledWith(first);
    expect(pages.disconnect).not.toHaveBeenCalled();
    stopSecond();
    expect(pages.disconnect).toHaveBeenCalledOnce();
    expect(thumbnails.disconnect).not.toHaveBeenCalled();

    const stopAnother = observeNearViewport(first, root, 1200, vi.fn());
    expect(MockIntersectionObserver.instances).toHaveLength(3);
    expect(MockIntersectionObserver.instances[2].options?.rootMargin).toBe('1200px 0px');
    stopAnother();
    stopThumbnail();
    expect(thumbnails.disconnect).toHaveBeenCalledOnce();
  });
});
