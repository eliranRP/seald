import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('toggles through the label', async () => {
    const onChange = vi.fn();
    const { getByRole } = renderWithTheme(
      <Checkbox label="Send" checked={false} onChange={onChange} />,
    );
    await userEvent.click(getByRole('checkbox', { name: 'Send' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('shows help text', () => {
    const { getByText } = renderWithTheme(
      <Checkbox
        label="Send"
        helpText="Needs a recent sign-in."
        checked={false}
        onChange={() => {}}
      />,
    );
    expect(getByText('Needs a recent sign-in.')).toBeInTheDocument();
  });
});
