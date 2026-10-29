import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteText } from './NoteText';

describe('NoteText', () => {
  it('renders bold and italic as elements, with search terms marked inside them', () => {
    const { container } = render(<NoteText text="A **bold** and *italic* note" terms={['ld and it']} />);
    expect(container.innerHTML).toBe(
      'A <strong>bo</strong><strong><mark class="review-mark">ld</mark></strong>' +
        '<mark class="review-mark"> and </mark><em><mark class="review-mark">it</mark></em><em>alic</em> note',
    );
  });

  it('renders text as text, whatever it contains', () => {
    const { container } = render(<NoteText text={'<b>not bold</b> 2 * 3 and 2*3*4 = x**2'} />);
    expect(container.querySelector('b, em, strong')).toBeNull();
    expect(container.textContent).toBe('<b>not bold</b> 2 * 3 and 2*3*4 = x**2');
  });
});
