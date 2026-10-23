import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SplitButton } from './SplitButton';

describe('SplitButton', () => {
  it('runs the main action and opens the options separately', () => {
    const onMain = vi.fn();
    const onOptions = vi.fn();
    const { getByRole } = renderWithTheme(
      <SplitButton label="Send" onMain={onMain} onOptions={onOptions} />,
    );
    fireEvent.click(getByRole('button', { name: 'Send' }));
    expect(onMain).toHaveBeenCalledTimes(1);
    expect(onOptions).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Send options' }));
    expect(onOptions).toHaveBeenCalledTimes(1);
  });

  it('disables both halves together', () => {
    const { getByRole } = renderWithTheme(
      <SplitButton label="Send" onMain={() => {}} onOptions={() => {}} disabled />,
    );
    expect(getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(getByRole('button', { name: 'Send options' })).toBeDisabled();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <SplitButton label="Send" onMain={() => {}} onOptions={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
