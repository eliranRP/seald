import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { useState } from 'react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'draw', label: 'Draw' },
  { value: 'type', label: 'Type' },
  { value: 'upload', label: 'Upload' },
] as const;

type Mode = (typeof OPTIONS)[number]['value'];

function Harness({ onChange }: { readonly onChange?: (v: Mode) => void }) {
  const [value, setValue] = useState<Mode>('draw');
  return (
    <SegmentedControl<Mode>
      aria-label="Signature style"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('exposes a named radio group with the selected option checked', () => {
    const { getByRole } = renderWithTheme(<Harness />);
    expect(getByRole('radiogroup', { name: 'Signature style' })).toBeInTheDocument();
    expect(getByRole('radio', { name: 'Draw' })).toHaveAttribute('aria-checked', 'true');
    expect(getByRole('radio', { name: 'Type' })).toHaveAttribute('aria-checked', 'false');
  });

  it('selects on click', async () => {
    const onChange = vi.fn();
    const { getByRole } = renderWithTheme(<Harness onChange={onChange} />);
    await userEvent.click(getByRole('radio', { name: 'Upload' }));
    expect(onChange).toHaveBeenCalledWith('upload');
    expect(getByRole('radio', { name: 'Upload' })).toHaveAttribute('aria-checked', 'true');
  });

  it('moves selection with arrow keys, Home and End, wrapping around', async () => {
    const { getByRole } = renderWithTheme(<Harness />);
    getByRole('radio', { name: 'Draw' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(getByRole('radio', { name: 'Type' })).toHaveFocus();
    expect(getByRole('radio', { name: 'Type' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{End}');
    expect(getByRole('radio', { name: 'Upload' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(getByRole('radio', { name: 'Draw' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(getByRole('radio', { name: 'Upload' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Home}');
    expect(getByRole('radio', { name: 'Draw' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps a single tab stop on the selected segment', () => {
    const { getByRole } = renderWithTheme(<Harness />);
    expect(getByRole('radio', { name: 'Draw' })).toHaveAttribute('tabindex', '0');
    expect(getByRole('radio', { name: 'Type' })).toHaveAttribute('tabindex', '-1');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
