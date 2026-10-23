import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { HeaderBell } from './HeaderBell';

describe('HeaderBell', () => {
  it('has a plain name with nothing pending', () => {
    renderWithTheme(<HeaderBell count={0} onClick={() => undefined} />);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveTextContent('');
  });

  it('puts the pending count in the name and the badge', () => {
    renderWithTheme(<HeaderBell count={3} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Notifications, 3 pending' })).toHaveTextContent('3');
  });

  it('caps the visible badge at 99+', () => {
    renderWithTheme(<HeaderBell count={142} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Notifications, 142 pending' })).toHaveTextContent(
      '99+',
    );
  });

  it('calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithTheme(<HeaderBell count={1} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
