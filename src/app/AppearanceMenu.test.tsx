import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStorageDialogStore } from '@/features/settings/storageDialogStore';
import { AppearanceMenu } from './AppearanceMenu';

afterEach(() => {
  cleanup();
  useStorageDialogStore.setState({ open: false });
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
});
