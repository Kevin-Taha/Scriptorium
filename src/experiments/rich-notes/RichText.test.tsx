import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainPreview } from './plainPreview';
import RichText from './RichText';
import { RichNoteText } from './RichNoteText';

afterEach(cleanup);

describe('RichText', () => {
  it('renders the Markdown subset as elements', () => {
    const { container } = render(
      <RichText text={'The **second** *law* ~~x~~ `code`\n\n- one\n- two\n\n1. a\n2. b\n\n> quoted'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('second');
    expect(container.querySelector('em')?.textContent).toBe('law');
    expect(container.querySelector('del')?.textContent).toBe('x');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.querySelector('blockquote')?.textContent).toBe('quoted');
  });

  it('opens links safely in a new tab and does not let a link press reach the note', () => {
    const onClick = vi.fn();
    // Pressing a real link would navigate happy-dom's window.
    const cancelNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', cancelNavigation, true);
    const { container } = render(
      // biome-ignore lint/a11y/useKeyWithClickEvents: stands in for the note card
      // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the note card
      <div onClick={onClick}>
        <RichText text="see [wiki](https://en.wikipedia.org/wiki/Inertia) and https://example.com" />
      </div>,
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Inertia');
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    fireEvent.click(links[0]);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('p') as Element);
    expect(onClick).toHaveBeenCalledOnce();
    document.removeEventListener('click', cancelNavigation, true);
  });

  it('never turns user text into HTML or unsafe links', () => {
    const { container } = render(
      <RichText text={'<img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1))'} />,
    );
    expect(container.querySelector('img, script, a')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('[x](javascript:alert(1))');
  });

  it('keeps prices as plain text', () => {
    const { container } = render(<RichText text="Costs $5 and $10" />);
    expect(container.textContent).toBe('Costs $5 and $10');
    expect(container.querySelector('.rich-math')).toBeNull();
  });

  it('shows maths as muted source until KaTeX loads, then as typeset maths', async () => {
    const { container } = render(<RichText text={'so $F = ma$\n\n$$x^2$$'} />);
    const raw = container.querySelectorAll('.rich-math--raw');
    expect(raw).toHaveLength(2);
    expect(raw[0].textContent).toBe('$F = ma$');
    expect(raw[1].textContent).toBe('$$x^2$$');

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(2));
    expect(container.querySelector('.rich-math--raw')).toBeNull();
    expect(container.querySelector('.rich-math--display .katex-display')).not.toBeNull();
    expect(container.querySelector('.katex-mathml')).not.toBeNull();
  });

  it('shows invalid TeX in the danger colour instead of throwing', async () => {
    const { container } = render(<RichText text={'bad $\\frac{a$'} />);
    await waitFor(() => expect(container.querySelector('.katex-error')).not.toBeNull());
    expect(container.querySelector('.katex-error')?.getAttribute('style')).toContain('var(--color-danger)');
  });

  it('marks search terms inside rendered text', () => {
    const { container } = render(<RichText text="The **second law** applies" terms={['law']} />);
    const marks = container.querySelectorAll('mark.review-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('law');
    expect(container.querySelector('strong')?.textContent).toBe('second law');
  });
});

describe('RichNoteText', () => {
  it('renders plain text at first and the rich note once its chunk has loaded', async () => {
    const { container } = render(<RichNoteText text="a **b**" />);
    await waitFor(() => expect(container.querySelector('.rich-note strong')?.textContent).toBe('b'));
  });
});

describe('plainPreview', () => {
  it('drops markup but keeps the words and the TeX source', () => {
    expect(plainPreview('The **second law**: $F = ma$, see [wiki](https://w.org)')).toBe(
      'The second law: F = ma, see wiki',
    );
    expect(plainPreview('- *mass* vs weight\n- `code` and $a_1$')).toBe('mass vs weight code and a_1');
    expect(plainPreview('Work:\n$$W = \\int F\\,dx$$')).toBe('Work: W = \\int F\\,dx');
    expect(plainPreview('Costs $5 and $10')).toBe('Costs $5 and $10');
    expect(plainPreview('snake_case_name')).toBe('snake_case_name');
  });
});
