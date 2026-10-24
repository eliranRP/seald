import { describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import type { AddSignerContact } from '../AddSignerDropdown/AddSignerDropdown.types';
import { PersonPicker } from './PersonPicker';

const ME: AddSignerContact = {
  id: 'me:u1',
  name: 'Eliran Azulay',
  email: 'eliran@seald.app',
  color: '#F472B6',
};
const HANNAH: AddSignerContact = {
  id: 'c-hannah',
  name: 'Hannah Wills',
  email: 'hannah@quill.vc',
  color: '#7DD3FC',
};
const ALEX: AddSignerContact = {
  id: 'c-alex',
  name: 'Alex Reyes',
  email: 'alex@quill.vc',
  color: '#FBBF24',
};
const OPTIONS = [ME, HANNAH, ALEX];

function setup(over: Partial<React.ComponentProps<typeof PersonPicker>> = {}) {
  const onChange = vi.fn();
  const utils = renderWithTheme(
    <PersonPicker
      aria-label="Person for Signer 1"
      value={HANNAH}
      options={OPTIONS}
      onChange={onChange}
      youId={ME.id}
      {...over}
    />,
  );
  return { onChange, ...utils };
}

describe('PersonPicker', () => {
  it('shows the chosen person, or a dashed "Choose a person" when nobody is', () => {
    const first = setup();
    const trigger = first.getByRole('button', { name: 'Person for Signer 1' });
    expect(within(trigger).getByText('Hannah Wills')).toBeInTheDocument();
    expect(within(trigger).getByText('hannah@quill.vc')).toBeInTheDocument();
    first.unmount();
    const empty = setup({ value: null });
    expect(empty.getByText('Choose a person')).toBeInTheDocument();
  });

  it('opens a listbox of everyone, marks the chosen one and calls onChange on pick', async () => {
    const user = userEvent.setup();
    const { getByRole, onChange } = setup();
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    const list = getByRole('listbox', { name: 'Person for Signer 1' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(within(list).getByRole('option', { name: /Hannah Wills/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(list).getByText('Your account')).toBeInTheDocument();
    await user.click(within(list).getByRole('option', { name: /Alex Reyes/ }));
    expect(onChange).toHaveBeenCalledWith(ALEX);
    expect(() => getByRole('listbox')).toThrow();
  });

  it('filters by name or email', async () => {
    const user = userEvent.setup();
    const { getByRole } = setup();
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    await user.type(getByRole('searchbox', { name: 'Search contacts' }), 'alex');
    expect(within(getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    await user.clear(getByRole('searchbox', { name: 'Search contacts' }));
    await user.type(getByRole('searchbox', { name: 'Search contacts' }), 'zzz');
    expect(getByRole('listbox')).toHaveTextContent('No contacts match');
  });

  it('disables people chosen for another role', async () => {
    const user = userEvent.setup();
    const { getByRole, onChange } = setup({ value: null, disabledIds: [ALEX.id] });
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    const alex = getByRole('option', { name: /Alex Reyes/ });
    expect(alex).toBeDisabled();
    await user.click(alex);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape closes only the list and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    const { getByRole, queryByRole } = setup();
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    await user.keyboard('{Escape}');
    window.removeEventListener('keydown', outer);
    expect(queryByRole('listbox')).toBeNull();
    expect(getByRole('button', { name: 'Person for Signer 1' })).toHaveFocus();
    expect(outer).not.toHaveBeenCalled();
  });

  it('adds a person by email, picks them, and picks an existing contact instead of duplicating', async () => {
    const user = userEvent.setup();
    const NORA: AddSignerContact = {
      id: 'c-nora',
      name: 'Nora',
      email: 'nora@acme.co',
      color: '#34D399',
    };
    const onCreate = vi.fn().mockResolvedValue(NORA);
    const { getByRole, onChange } = setup({ onCreate });
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(getByRole('button', { name: 'New email' }));
    await user.type(getByRole('textbox', { name: 'New email' }), 'Nora@Acme.co');
    await user.click(getByRole('button', { name: 'Add' }));
    expect(onCreate).toHaveBeenCalledWith('nora@acme.co');
    expect(onChange).toHaveBeenCalledWith(NORA);

    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(getByRole('button', { name: 'New email' }));
    await user.type(getByRole('textbox', { name: 'New email' }), 'alex@quill.vc{Enter}');
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(ALEX);
  });

  it('shows an error for a bad email and when saving the person fails', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error('boom'));
    const { getByRole, findByRole } = setup({ onCreate });
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(getByRole('button', { name: 'New email' }));
    await user.type(getByRole('textbox', { name: 'New email' }), 'nope{Enter}');
    expect(await findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    await user.clear(getByRole('textbox', { name: 'New email' }));
    await user.type(getByRole('textbox', { name: 'New email' }), 'ok@acme.co{Enter}');
    expect(await findByRole('alert')).toHaveTextContent('Could not add this person. Try again.');
  });

  it('hides the New email row when onCreate is not given', async () => {
    const user = userEvent.setup();
    const { getByRole, queryByRole } = setup();
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    expect(queryByRole('button', { name: 'New email' })).toBeNull();
  });

  it('has no axe violations open or closed', async () => {
    const user = userEvent.setup();
    const { container, getByRole } = setup();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(getByRole('button', { name: 'Person for Signer 1' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
