import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Checkbox } from './Checkbox';

function Harness() {
  const [checked, setChecked] = useState(false);
  return <Checkbox label="Read envelopes" checked={checked} onChange={setChecked} />;
}

describe('Checkbox', () => {
  it('toggles through its accessible name', async () => {
    renderWithTheme(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'Read envelopes' });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(box).toBeChecked();
    await userEvent.click(screen.getByText('Read envelopes'));
    expect(box).not.toBeChecked();
  });

  it('links the hint as the description', () => {
    renderWithTheme(
      <Checkbox label="Send" hint="Needs approval." checked={false} onChange={() => undefined} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Send' })).toHaveAccessibleDescription(
      'Needs approval.',
    );
  });

  it('does not fire onChange when disabled', async () => {
    const onChange = vi.fn();
    renderWithTheme(<Checkbox label="Send" checked={false} disabled onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Send' });
    expect(box).toBeDisabled();
    await userEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });
});
