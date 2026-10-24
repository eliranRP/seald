import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { Calendar } from 'lucide-react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { InfoChip } from './InfoChip';

describe('InfoChip', () => {
  it('renders its label with a decorative icon', () => {
    const { getByText, container } = renderWithTheme(
      <InfoChip icon={Calendar}>Expires May 12</InfoChip>,
    );
    expect(getByText('Expires May 12')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('renders without an icon', () => {
    const { container } = renderWithTheme(<InfoChip>2 signers</InfoChip>);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<InfoChip icon={Calendar}>Expires</InfoChip>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
