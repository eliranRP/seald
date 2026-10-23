import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MetaFieldDrawer, type MetaFieldDrawerProps } from './MetaFieldDrawer';

function setup(props: Partial<MetaFieldDrawerProps> & Pick<MetaFieldDrawerProps, 'kind'>) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const utils = renderWithTheme(
    <MetaFieldDrawer open label="Field" onApply={onApply} onCancel={onCancel} {...props} />,
  );
  return { onApply, onCancel, ...utils };
}

const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Large', value: 'l' },
];

describe('MetaFieldDrawer', () => {
  it('prefills a name field with the signer name and applies it', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'name', label: 'Full name', signerName: 'Maya Raskin' });
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue('Maya Raskin');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('Maya Raskin');
  });

  it('checks a number against its range before sending, and announces the problem', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'number', label: 'Quantity', meta: { min: 1, max: 10 } });
    const input = screen.getByRole('textbox', { name: 'Quantity' });
    expect(screen.getByText('A number from 1 to 10.')).toBeInTheDocument();

    await user.type(input, '12');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number from 1 to 10.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/enter a number from 1 to 10/i);

    await user.clear(input);
    await user.type(input, '7');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('7');
  });

  it('rejects text that is not a number', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'number', label: 'Quantity' });
    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '1e3');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number, for example 1234.5.');
  });

  it('enforces a text character limit', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'text', label: 'Note', meta: { char_limit: 5 } });
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'abcdefg');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Use at most 5 characters.');
  });

  it('renders a radio group from the options and sends the chosen value', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'radio', label: 'Size', meta: { options: OPTIONS } });
    const group = screen.getByRole('radiogroup', { name: 'Size' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an option.');

    await user.click(screen.getByRole('radio', { name: 'Large' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('l');
  });

  it('preselects the default radio option', () => {
    setup({ kind: 'radio', label: 'Size', meta: { options: OPTIONS, default: 's' } });
    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked();
  });

  it('renders a dropdown and sends the chosen value', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'dropdown', label: 'Plan', meta: { options: OPTIONS } });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Plan' }), 'l');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('l');
  });

  it('sends a date as yyyy-MM-dd and reads a stored value back in that form', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({
      kind: 'date',
      label: 'Start date',
      initialValue: '09/03/2026',
      dateFormat: 'dd/MM/yyyy',
    });
    expect(screen.getByDisplayValue('2026-03-09')).toHaveAttribute('type', 'date');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('2026-03-09');
  });

  it('validates an email address', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ kind: 'email', label: 'Work email' });
    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'nope');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  });

  it('shows the API rejection inline and clears it once the signer edits', async () => {
    const user = userEvent.setup();
    setup({
      kind: 'number',
      label: 'Quantity',
      initialValue: '5',
      serverError: 'Enter a number from 1 to 10.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number from 1 to 10.');
    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup({ kind: 'text', label: 'Note' });
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = setup({ kind: 'radio', label: 'Size', meta: { options: OPTIONS } });
    expect(await axe(container)).toHaveNoViolations();
  });
});
