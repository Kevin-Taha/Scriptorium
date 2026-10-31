import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { exitFocusMode, useFocusStore } from '@/features/focus/focusStore';
import { useStorageDialogStore } from '@/features/settings/storageDialogStore';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { AppearanceMenu } from './AppearanceMenu';
import { useSettingsStore } from './settingsStore';

afterEach(() => {
  cleanup();
  exitFocusMode();
  useStorageDialogStore.setState({ open: false });
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

describe('AppearanceMenu', () => {
  it('links to Library & storage and closes itself', () => {
    render(<AppearanceMenu />);
    const trigger = screen.getByRole('button', { name: 'Appearance' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Library & storage…' }));
    expect(useStorageDialogStore.getState().open).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Appearance' })).toBeNull();
  });

  it('switches the reading aids on and off', () => {
    render(<AppearanceMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    const ruler = screen.getByRole('switch', { name: /Reading ruler/ });
    const map = screen.getByRole('switch', { name: /Book map/ });
    expect(ruler).toHaveProperty('checked', false);
    expect(map).toHaveProperty('checked', true);
    fireEvent.click(ruler);
    fireEvent.click(map);
    expect(useSettingsStore.getState()).toMatchObject({ readingRuler: true, bookMap: false });
  });

  it('holds the zoom controls and turns focus mode on, closing itself', () => {
    render(<AppearanceMenu />);
    const trigger = screen.getByRole('button', { name: 'Appearance' });
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Zoom level/ })).toBeTruthy();

    const focus = screen.getByRole('switch', { name: 'Focus mode' });
    expect(focus.getAttribute('aria-keyshortcuts')).toBe('F');
    expect(focus).toHaveProperty('checked', false);
    fireEvent.click(focus);
    expect(useFocusStore.getState().active).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Appearance' })).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole('switch', { name: 'Focus mode' })).toHaveProperty('checked', true);
  });

  it('offers the keyboard shortcuts with their key', () => {
    render(<AppearanceMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    const shortcuts = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(shortcuts.getAttribute('aria-keyshortcuts')).toBe('?');
  });
});
