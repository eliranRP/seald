import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { StatusBadge, STATUS_BADGE_MAP } from './StatusBadge';
import type { SignerStatus } from '../../types/sealdTypes';

const pairs: ReadonlyArray<readonly [SignerStatus, string]> = [
  ['awaiting-you', 'Awaiting you'],
  ['awaiting-others', 'Awaiting others'],
  ['completed', 'Signed'],
  ['declined', 'Declined'],
  ['expired', 'Expired'],
  ['draft', 'Draft'],
];

describe('StatusBadge', () => {
  it.each(pairs)('maps %s → %s', (status, label) => {
    const { getByText } = renderWithTheme(<StatusBadge status={status} />);
    expect(getByText(label)).toBeInTheDocument();
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<StatusBadge status="awaiting-you" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('STATUS_BADGE_MAP is frozen + exhaustive', () => {
    expect(Object.isFrozen(STATUS_BADGE_MAP)).toBe(true);
    expect(Object.keys(STATUS_BADGE_MAP).sort()).toEqual([
      'awaiting-others',
      'awaiting-you',
      'completed',
      'declined',
      'draft',
      'expired',
    ]);
  });
});
