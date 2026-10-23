import { describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { AddSignerPanel } from './AddSignerPanel';

const CONTACTS = [
  { id: 'c1', name: 'Maya Raskin', email: 'maya@farrow.co', color: '#F472B6' },
  { id: 'c2', name: 'Hannah Wills', email: 'hannah@farrow.co', color: '#7DD3FC' },
  { id: 'c3', name: 'Jonah Park', email: 'jonah@park.dev', color: '#FBBF24' },
];

function setup(over: Partial<React.ComponentProps<typeof AddSignerPanel>> = {}) {
  const onAddContacts = vi.fn();
  const onCreate = vi.fn();
  const utils = renderWithTheme(
    <AddSignerPanel
      contacts={CONTACTS}
      existingIds={['c1']}
      existingEmails={['maya@farrow.co']}
      onAddContacts={onAddContacts}
      onCreate={onCreate}
      {...over}
    />,
  );
  return { ...utils, onAddContacts, onCreate };
}

describe('AddSignerPanel', () => {
  it('offers recent contacts that are not on the list yet and adds one with a tap', () => {
    const { getByRole, queryByRole, onAddContacts } = setup();
    expect(queryByRole('button', { name: 'Add Maya Raskin' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Add Hannah Wills' }));
    expect(onAddContacts).toHaveBeenCalledWith([CONTACTS[1]]);
  });

  it('picks several contacts in the dialog; added people are checked and disabled', () => {
    const { getByRole, onAddContacts } = setup();
    fireEvent.click(getByRole('button', { name: 'From contacts' }));
    const dialog = getByRole('dialog', { name: 'Contacts' });
    expect(within(dialog).getByRole('checkbox', { name: 'Maya Raskin' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Maya Raskin' })).toBeChecked();
    expect(within(dialog).getByText('Added')).toBeInTheDocument();
    const add = within(dialog).getByRole('button', { name: 'Add 0 signers' });
    expect(add).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Hannah Wills' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Jonah Park' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 signers' }));
    expect(onAddContacts).toHaveBeenCalledWith([CONTACTS[1], CONTACTS[2]]);
  });

  it('filters the contact list by search', () => {
    const { getByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'From contacts' }));
    const dialog = getByRole('dialog', { name: 'Contacts' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search contacts' }), {
      target: { value: 'jonah' },
    });
    expect(within(dialog).queryByRole('checkbox', { name: 'Hannah Wills' })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'Jonah Park' })).toBeInTheDocument();
  });

  it('closes the dialog on Cancel', () => {
    const { getByRole, queryByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'From contacts' }));
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(queryByRole('dialog')).toBeNull();
  });

  it('adds a new email through the inline form', () => {
    const { getByRole, getByLabelText, getByText, onCreate } = setup();
    fireEvent.click(getByRole('button', { name: 'New email' }));
    expect(getByText('Saved to Contacts')).toBeInTheDocument();
    fireEvent.change(getByLabelText('Name'), { target: { value: 'Dana Levi' } });
    fireEvent.change(getByLabelText('Email'), { target: { value: 'dana@levi.co' } });
    fireEvent.click(getByRole('button', { name: 'Add' }));
    expect(onCreate).toHaveBeenCalledWith('Dana Levi', 'dana@levi.co');
  });

  it('derives a name from the email and rejects bad or duplicate addresses', () => {
    const { getByRole, getByLabelText, onCreate } = setup();
    fireEvent.click(getByRole('button', { name: 'New email' }));
    fireEvent.change(getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(getByRole('button', { name: 'Add' }));
    expect(getByRole('alert')).toHaveTextContent('Enter a valid email');
    fireEvent.change(getByLabelText('Email'), { target: { value: 'MAYA@farrow.co' } });
    fireEvent.click(getByRole('button', { name: 'Add' }));
    expect(getByRole('alert')).toHaveTextContent('Already on the list');
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.change(getByLabelText('Email'), { target: { value: 'dana@levi.co' } });
    fireEvent.click(getByRole('button', { name: 'Add' }));
    expect(onCreate).toHaveBeenCalledWith('dana', 'dana@levi.co');
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
