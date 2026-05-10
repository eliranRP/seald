import { describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TagChip } from './TagChip';

describe('TagChip', () => {
  it('renders the label text', () => {
    const { getByText } = renderWithTheme(<TagChip label="urgent" />);
    expect(getByText('urgent')).toBeInTheDocument();
  });

  it('does not render a remove button when no onRemove is supplied', () => {
    const { queryByRole } = renderWithTheme(<TagChip label="tax-2026" />);
    expect(queryByRole('button')).toBeNull();
  });

  it('renders a remove button labelled with the tag name when onRemove is supplied', () => {
    const onRemove = vi.fn();
    const { getByRole } = renderWithTheme(<TagChip label="urgent" onRemove={onRemove} />);
    const btn = getByRole('button', { name: /remove tag urgent/i });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders the same name in the same colour each time (deterministic hash)', () => {
    const { getAllByText } = renderWithTheme(
      <>
        <TagChip label="urgent" />
        <TagChip label="urgent" />
      </>,
    );
    const els = getAllByText('urgent');
    expect(els).toHaveLength(2);
    const a = window.getComputedStyle(els[0]!).backgroundColor;
    const b = window.getComputedStyle(els[1]!).backgroundColor;
    expect(a.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});
