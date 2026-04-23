import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PasswordField } from './PasswordField';

describe('PasswordField', () => {
  it('renders label and input with type=password by default', () => {
    const { getByLabelText } = renderWithTheme(<PasswordField label="Password" />);
    const input = getByLabelText('Password') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('password');
  });

  it('toggles visibility and aria-label when eye button is clicked', async () => {
    const { getByLabelText } = renderWithTheme(<PasswordField label="Password" />);
    const input = getByLabelText('Password') as HTMLInputElement;
    const toggle = getByLabelText('Show password');
    expect(input.type).toBe('password');
    await userEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(getByLabelText('Hide password')).toBeInTheDocument();
  });

  it('calls onChange with the string value', async () => {
    const onChange = vi.fn();
    const { getByLabelText } = renderWithTheme(
      <PasswordField label="Password" onChange={onChange} />,
    );
    await userEvent.type(getByLabelText('Password'), 'ab');
    expect(onChange).toHaveBeenLastCalledWith('ab', expect.anything());
  });

  it('shows error text and sets aria-invalid when error is present', () => {
    const { getByLabelText, getByRole } = renderWithTheme(
      <PasswordField label="Password" error="Required" />,
    );
    expect(getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(getByRole('alert')).toHaveTextContent('Required');
  });

  it('renders labelRight slot content', () => {
    const { getByText } = renderWithTheme(
      <PasswordField label="Password" labelRight={<button type="button">Forgot?</button>} />,
    );
    expect(getByText('Forgot?')).toBeInTheDocument();
  });

  it('forwards ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    renderWithTheme(<PasswordField label="P" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<PasswordField label="Password" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
