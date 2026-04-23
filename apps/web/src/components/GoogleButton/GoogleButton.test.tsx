import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { GoogleButton } from './GoogleButton';

describe('GoogleButton', () => {
  it('renders default label "Continue with Google"', () => {
    const { getByRole } = renderWithTheme(<GoogleButton />);
    expect(getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('renders custom label prop', () => {
    const { getByRole } = renderWithTheme(<GoogleButton label="Sign up with Google" />);
    expect(getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(<GoogleButton onClick={onClick} />);
    await userEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled blocks click and sets aria-disabled', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(<GoogleButton onClick={onClick} disabled />);
    await userEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('busy blocks click, sets aria-busy, and renders spinner', async () => {
    const onClick = vi.fn();
    const { getByRole, getByTestId } = renderWithTheme(<GoogleButton onClick={onClick} busy />);
    await userEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(getByRole('button')).toHaveAttribute('aria-busy', 'true');
    expect(getByTestId('google-button-spinner')).toBeInTheDocument();
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<GoogleButton />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the button element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    renderWithTheme(<GoogleButton ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
