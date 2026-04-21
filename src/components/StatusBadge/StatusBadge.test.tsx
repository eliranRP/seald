import { describe, it, expect } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { StatusBadge, STATUS_BADGE_MAP } from './StatusBadge';
import type { SignerStatus } from '../../types/sealdTypes';

const pairs: ReadonlyArray<readonly [SignerStatus, string]> = [
  ['awaiting-you', 'Awaiting you'],
  ['awaiting-others', 'Awaiting others'],
  ['completed', 'Completed'],
  ['declined', 'Declined'],
  ['expired', 'Expired'],
  ['draft', 'Draft'],
];

describe('StatusBadge', () => {
  it.each(pairs)('maps %s → %s', (status, label) => {
    const { getByText } = renderWithTheme(<StatusBadge status={status} />);
    expect(getByText(label)).toBeInTheDocument();
  });

  it('STATUS_BADGE_MAP is frozen + exhaustive', () => {
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
