import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and value', () => {
    const { getByText } = renderWithTheme(
      <StatCard label="Awaiting you" value="12" tone="indigo" />,
    );
    expect(getByText('Awaiting you')).toBeInTheDocument();
    expect(getByText('12')).toBeInTheDocument();
  });

  it.each(['indigo', 'amber', 'emerald', 'red', 'neutral'] as const)('supports tone %s', (tone) => {
    const { getByText } = renderWithTheme(<StatCard label="Stat" value="1" tone={tone} />);
    expect(getByText('1')).toBeInTheDocument();
  });

  // Zero-state regression: an empty bucket ("Awaiting you 0",
  // "Awaiting others 0", "Sealed this month 0") shouldn't read in the
  // requested tone — there's no signal to draw the eye to. The
  // component overrides the value's tone to `neutral` whenever the
  // displayed number is `'0'`.
  it('overrides the value tone to neutral when value is "0"', () => {
    const { getByText } = renderWithTheme(
      <StatCard label="Awaiting you" value="0" tone="indigo" />,
    );
    expect(getByText('0')).toHaveAttribute('data-tone', 'neutral');
  });

  it('keeps the requested tone when value is non-zero', () => {
    const { getByText } = renderWithTheme(
      <StatCard label="Awaiting you" value="3" tone="indigo" />,
    );
    expect(getByText('3')).toHaveAttribute('data-tone', 'indigo');
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<StatCard ref={ref} label="Stat" value="1" tone="neutral" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <StatCard label="Awaiting you" value="12" tone="indigo" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('interactive variant', () => {
    it('renders a button and calls onActivate on click', () => {
      const onActivate = vi.fn();
      const { getByRole } = renderWithTheme(
        <StatCard label="Awaiting you" value="3" tone="indigo" onActivate={onActivate} />,
      );
      const btn = getByRole('button', { name: /awaiting you/i });
      fireEvent.click(btn);
      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('reflects the pressed state via aria-pressed', () => {
      const { getByRole, rerender } = renderWithTheme(
        <StatCard label="Sealed this month" value="1" tone="emerald" onActivate={vi.fn()} />,
      );
      expect(getByRole('button')).toHaveAttribute('aria-pressed', 'false');
      rerender(
        <StatCard label="Sealed this month" value="1" tone="emerald" active onActivate={vi.fn()} />,
      );
      expect(getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('stays a plain (non-button) tile when onActivate is omitted', () => {
      const { queryByRole, getByText } = renderWithTheme(
        <StatCard label="Avg. turnaround" value="4h" tone="neutral" />,
      );
      expect(queryByRole('button')).toBeNull();
      expect(getByText('Avg. turnaround')).toBeInTheDocument();
    });

    it('has no axe violations as a button', async () => {
      const { container } = renderWithTheme(
        <StatCard label="Awaiting others" value="2" tone="amber" active onActivate={vi.fn()} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
