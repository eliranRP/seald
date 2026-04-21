import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Mail } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TextField } from './TextField';

describe('TextField', () => {
  it('associates label with input via id', () => {
    const { getByLabelText } = renderWithTheme(<TextField label="Email" />);
    expect(getByLabelText('Email')).toBeInTheDocument();
  });

  it('calls onChange with the string value', async () => {
    const onChange = vi.fn();
    const { getByLabelText } = renderWithTheme(<TextField label="Email" onChange={onChange} />);
    await userEvent.type(getByLabelText('Email'), 'hi');
    expect(onChange).toHaveBeenLastCalledWith('hi', expect.anything());
  });

  it('shows error text and sets aria-invalid when error is present', () => {
    const { getByLabelText, getByRole } = renderWithTheme(
      <TextField label="Email" error="Required" />,
    );
    expect(getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(getByRole('alert')).toHaveTextContent('Required');
  });

  it('renders iconLeft decoratively', () => {
    const { container } = renderWithTheme(<TextField label="Email" iconLeft={Mail} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<TextField label="Name" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    renderWithTheme(<TextField label="N" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('forwards rest props (data-*, className) to the input', () => {
    const { getByLabelText } = renderWithTheme(
      <TextField label="N" data-testid="tf-input" className="custom" />,
    );
    const input = getByLabelText('N');
    expect(input).toHaveAttribute('data-testid', 'tf-input');
    expect(input).toHaveClass('custom');
  });
});
