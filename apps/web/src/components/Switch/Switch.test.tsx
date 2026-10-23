import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Switch } from './Switch';

function Harness({ initial = false }: { readonly initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return <Switch label="Send a webhook" checked={on} onChange={setOn} />;
}

describe('Switch', () => {
  it('is a switch named by its label and toggles', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Send a webhook' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('ignores taps while a save is pending', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Switch label="Send a webhook" checked onChange={onChange} pending />);
    const toggle = screen.getByRole('switch', { name: 'Send a webhook' });
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    await user.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Switch label="Send a webhook" checked={false} onChange={onChange} disabled />);
    await user.click(screen.getByRole('switch', { name: 'Send a webhook' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Harness initial />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
