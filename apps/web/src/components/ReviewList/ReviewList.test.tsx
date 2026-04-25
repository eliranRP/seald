import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ReviewList } from './ReviewList';
import type { ReviewItem } from './ReviewList.types';

const baseItems: ReadonlyArray<ReviewItem> = [
  { id: 'a', kind: 'signature', label: 'Signature', page: 1, valuePreview: 'Maya Raskin' },
  { id: 'b', kind: 'initials', label: 'Initials', page: 2, valuePreview: 'MR' },
  { id: 'c', kind: 'date', label: 'Date signed', page: 2, valuePreview: '2026-04-24' },
  { id: 'd', kind: 'text', label: 'Full address', page: 3, valuePreview: '1 Main St' },
  { id: 'e', kind: 'checkbox', label: 'Agree', page: 3, valuePreview: 'Checked' },
  { id: 'f', kind: 'email', label: 'Email', page: 4, valuePreview: 'maya@example.com' },
  { id: 'g', kind: 'name', label: 'Full name', page: 4, valuePreview: 'Maya Raskin' },
];

describe('ReviewList', () => {
  it('renders a row per item', () => {
    const { container } = renderWithTheme(<ReviewList items={baseItems} />);
    const rows = container.querySelectorAll('[data-testid^="review-row-"]');
    expect(rows).toHaveLength(baseItems.length);
    for (const item of baseItems) {
      expect(container.querySelector(`[data-testid="review-row-${item.id}"]`)).not.toBeNull();
    }
  });

  it('sets data-kind on each row matching the item kind', () => {
    const { container } = renderWithTheme(<ReviewList items={baseItems} />);
    for (const item of baseItems) {
      const row = container.querySelector(`[data-testid="review-row-${item.id}"]`);
      expect(row?.getAttribute('data-kind')).toBe(item.kind);
    }
  });

  it('renders the valuePreview node for strings, numeric strings, and custom nodes', () => {
    const items: ReadonlyArray<ReviewItem> = [
      { id: 's', kind: 'text', label: 'String', page: 1, valuePreview: 'hello' },
      { id: 'n', kind: 'text', label: 'Number', page: 1, valuePreview: String(42) },
      {
        id: 'c',
        kind: 'text',
        label: 'Custom',
        page: 1,
        valuePreview: <span>custom-preview-node</span>,
      },
    ];
    const { getByText } = renderWithTheme(<ReviewList items={items} />);
    expect(getByText('hello')).toBeInTheDocument();
    expect(getByText('42')).toBeInTheDocument();
    expect(getByText('custom-preview-node')).toBeInTheDocument();
  });

  it('renders "Page X" for each item', () => {
    const { getAllByText } = renderWithTheme(<ReviewList items={baseItems} />);
    for (const item of baseItems) {
      expect(getAllByText(`Page ${item.page}`).length).toBeGreaterThan(0);
    }
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<ReviewList items={baseItems} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<ReviewList ref={ref} items={baseItems} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
