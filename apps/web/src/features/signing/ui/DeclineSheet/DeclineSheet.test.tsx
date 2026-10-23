import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { DeclineSheet } from './DeclineSheet';
import { composeDeclineReason } from './composeDeclineReason';

describe('composeDeclineReason', () => {
  it('joins the chip and the note', () => {
    expect(composeDeclineReason('terms', 'Clause 4 is too broad')).toBe(
      'Terms: Clause 4 is too broad',
    );
  });
  it('uses either part alone, or nothing', () => {
    expect(composeDeclineReason('wrong_person', '  ')).toBe('Wrong person');
    expect(composeDeclineReason(null, ' not mine ')).toBe('not mine');
    expect(composeDeclineReason(null, '')).toBeUndefined();
  });
  it('caps the reason at the API limit', () => {
    expect(composeDeclineReason('other', 'x'.repeat(900))).toHaveLength(500);
  });
});

describe('DeclineSheet', () => {
  it('sends the chosen chip and the note to the sender', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = renderWithTheme(
      <DeclineSheet open onClose={() => {}} senderName="Eliran" onConfirm={onConfirm} />,
    );
    const terms = getByRole('button', { name: 'Terms' });
    expect(terms).toHaveAttribute('aria-pressed', 'false');
    await user.click(terms);
    expect(terms).toHaveAttribute('aria-pressed', 'true');
    await user.type(getByRole('textbox', { name: 'Note to Eliran (optional)' }), 'Too broad');
    await user.click(getByRole('button', { name: 'Decline' }));
    expect(onConfirm).toHaveBeenCalledWith('Terms: Too broad');
  });

  it('can decline with no reason at all', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = renderWithTheme(
      <DeclineSheet open onClose={() => {}} senderName={null} onConfirm={onConfirm} />,
    );
    await user.click(getByRole('button', { name: 'Decline' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('cancels, shows an error and has no axe violations', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { getByRole, container } = renderWithTheme(
      <DeclineSheet
        open
        onClose={onClose}
        senderName="Eliran"
        error="Could not decline."
        onConfirm={() => {}}
      />,
    );
    expect(getByRole('alert')).toHaveTextContent('Could not decline.');
    expect(await axe(container)).toHaveNoViolations();
    await user.click(getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
