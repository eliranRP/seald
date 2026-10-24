import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ENVELOPE_BADGE_MAP, StatusBadge, STATUS_BADGE_MAP } from './StatusBadge';
import type { EnvelopeBadgeStatus } from './StatusBadge.types';
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

  it.each<readonly [EnvelopeBadgeStatus, string]>([
    ['you', 'Your turn'],
    ['others', 'Waiting'],
    ['sealing', 'Sealing'],
    ['sealed', 'Sealed'],
    ['declined', 'Declined'],
    ['expired', 'Expired'],
    ['canceled', 'Canceled'],
    ['draft', 'Draft'],
  ])('maps envelope status %s → %s with an icon', (status, label) => {
    const { getByText, container } = renderWithTheme(<StatusBadge status={status} />);
    expect(getByText(label)).toBeInTheDocument();
    expect(container.querySelector('[data-part="icon"] svg')).not.toBeNull();
    expect(ENVELOPE_BADGE_MAP[status].label).toBe(label);
  });

  it('accepts a label override', () => {
    const { getByText } = renderWithTheme(<StatusBadge status="others" label="Waiting on Maya" />);
    expect(getByText('Waiting on Maya')).toBeInTheDocument();
  });
});
