import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ReadinessChip } from './ReadinessChip';

describe('ReadinessChip', () => {
  it('reads Ready with no issues', () => {
    const { getByRole } = renderWithTheme(<ReadinessChip issues={0} />);
    expect(getByRole('button', { name: 'Ready' })).toBeInTheDocument();
  });

  it('counts issues and opens the list on click', () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(<ReadinessChip issues={2} onClick={onClick} />);
    const chip = getByRole('button', { name: '2 issues' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses the singular for one issue', () => {
    const { getByRole } = renderWithTheme(<ReadinessChip issues={1} expanded />);
    expect(getByRole('button', { name: '1 issue' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<ReadinessChip issues={1} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
