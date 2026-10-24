import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CheckChip } from './CheckChip';

describe('CheckChip', () => {
  it.each([
    ['ok', 'passed'],
    ['bad', 'failed'],
    ['off', 'not checked'],
  ] as const)('spells out the %s state for screen readers', (state, spoken) => {
    const { getByText } = renderWithTheme(<CheckChip state={state}>Signature</CheckChip>);
    const chip = getByText('Signature');
    expect(chip).toHaveTextContent(`Signature (${spoken})`);
    expect(chip).toHaveAttribute('data-state', state);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <div>
        <CheckChip>Signature valid</CheckChip>
        <CheckChip state="bad" index={1}>
          Tampered
        </CheckChip>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
