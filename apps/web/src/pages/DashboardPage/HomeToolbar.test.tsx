import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { EMPTY_VIEW } from '@/features/dashboard';
import type { ViewFilters } from '@/features/dashboard';
import { renderWithProviders } from '../../test/renderWithProviders';
import { HomeToolbar } from './HomeToolbar';

function noop(): void {
  /* test stub */
}

function toolbar(filters: ViewFilters, onChange: (patch: Partial<ViewFilters>) => void) {
  return (
    <HomeToolbar
      filters={filters}
      onChange={onChange}
      onClear={noop}
      people={[]}
      tags={[]}
      mobile={false}
      onOpenFilterSheet={noop}
      onStartSelecting={noop}
    />
  );
}

describe('HomeToolbar search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps what was typed when its own earlier query lands late', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(toolbar(EMPTY_VIEW, onChange));
    const box = screen.getByRole('searchbox', { name: 'Search documents' });

    fireEvent.change(box, { target: { value: 'lease' } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenLastCalledWith({ query: 'lease' });

    // The user types on before the parent re-renders with "lease".
    fireEvent.change(box, { target: { value: 'zebra' } });
    rerender(toolbar({ ...EMPTY_VIEW, query: 'lease' }, onChange));
    expect(box).toHaveValue('zebra');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenLastCalledWith({ query: 'zebra' });
  });

  it('follows the query when it is cleared from outside the box', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(toolbar({ ...EMPTY_VIEW, query: 'lease' }, onChange));
    const box = screen.getByRole('searchbox', { name: 'Search documents' });
    expect(box).toHaveValue('lease');

    rerender(toolbar(EMPTY_VIEW, onChange));
    expect(box).toHaveValue('');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
