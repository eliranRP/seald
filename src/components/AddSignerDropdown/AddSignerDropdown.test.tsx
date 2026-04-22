import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { AddSignerDropdown } from './AddSignerDropdown';
import type { AddSignerContact } from './AddSignerDropdown.types';

const CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Ana Torres', email: 'ana@farrow.law', color: '#4F46E5' },
  { id: 'c2', name: 'Brooke Lin', email: 'brooke@acme.co', color: '#10B981' },
  { id: 'c3', name: 'Carlos Mendes', email: 'carlos@acme.co', color: '#F59E0B' },
  { id: 'c4', name: 'Dana Vance', email: 'dana@forge.io', color: '#EF4444' },
];

function noop(): void {}

describe('AddSignerDropdown', () => {
  it('renders empty-state hint when no query and no matches', () => {
    const { getByText } = renderWithTheme(
      <AddSignerDropdown contacts={[]} onPick={noop} onCreate={noop} />,
    );
    expect(getByText('Type a name or email to search your contacts.')).toBeInTheDocument();
  });

  it('filters contacts by substring in name or email (case-insensitive)', async () => {
    const { getByRole, queryByText, getByText } = renderWithTheme(
      <AddSignerDropdown contacts={CONTACTS} onPick={noop} onCreate={noop} />,
    );
    const search = getByRole('searchbox');
    await userEvent.type(search, 'acme');
    expect(getByText('Brooke Lin')).toBeInTheDocument();
    expect(getByText('Carlos Mendes')).toBeInTheDocument();
    expect(queryByText('Ana Torres')).toBeNull();
    expect(queryByText('Dana Vance')).toBeNull();
  });

  it('excludes contacts whose ids are in existingContactIds', () => {
    const { queryByText, getByText } = renderWithTheme(
      <AddSignerDropdown
        contacts={CONTACTS}
        existingContactIds={['c1', 'c2']}
        onPick={noop}
        onCreate={noop}
      />,
    );
    expect(queryByText('Ana Torres')).toBeNull();
    expect(queryByText('Brooke Lin')).toBeNull();
    expect(getByText('Carlos Mendes')).toBeInTheDocument();
    expect(getByText('Dana Vance')).toBeInTheDocument();
  });

  it('fires onPick(contact) when a contact option is clicked', async () => {
    const onPick = vi.fn();
    const { getByRole } = renderWithTheme(
      <AddSignerDropdown contacts={CONTACTS} onPick={onPick} onCreate={noop} />,
    );
    const option = getByRole('option', { name: /Ana Torres/ });
    await userEvent.click(option);
    expect(onPick).toHaveBeenCalledTimes(1);
    const firstCall = onPick.mock.calls[0];
    const pickedArg = firstCall ? firstCall[0] : undefined;
    expect(pickedArg).toEqual(CONTACTS[0]);
  });

  it('shows the create row for a non-matching valid email and calls onCreate with local-part and email', async () => {
    const onCreate = vi.fn();
    const { getByRole, getByText } = renderWithTheme(
      <AddSignerDropdown contacts={CONTACTS} onPick={noop} onCreate={onCreate} />,
    );
    const search = getByRole('searchbox');
    await userEvent.type(search, 'new.person@example.com');
    const createBtn = getByRole('button', { name: /Add "new.person@example.com" as new contact/ });
    expect(getByText('Not in your contacts.')).toBeInTheDocument();
    await userEvent.click(createBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
    const firstCall = onCreate.mock.calls[0];
    const nameArg = firstCall ? firstCall[0] : undefined;
    const emailArg = firstCall ? firstCall[1] : undefined;
    expect(nameArg).toBe('new.person');
    expect(emailArg).toBe('new.person@example.com');
  });

  it('does NOT show the create row when the typed email matches an existing contact', async () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <AddSignerDropdown contacts={CONTACTS} onPick={noop} onCreate={noop} />,
    );
    const search = getByRole('searchbox');
    await userEvent.type(search, 'ana@farrow.law');
    expect(queryByRole('button', { name: /as new contact/ })).toBeNull();
  });

  it('caps visible results by maxResults', () => {
    const many: ReadonlyArray<AddSignerContact> = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      name: `Person ${i}`,
      email: `p${i}@example.com`,
      color: '#4F46E5',
    }));
    const { getAllByRole } = renderWithTheme(
      <AddSignerDropdown contacts={many} onPick={noop} onCreate={noop} maxResults={3} />,
    );
    expect(getAllByRole('option').length).toBe(3);
  });

  it('pressing Escape calls onClose when provided', async () => {
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(
      <AddSignerDropdown contacts={CONTACTS} onPick={noop} onCreate={noop} onClose={onClose} />,
    );
    const search = getByRole('searchbox');
    search.focus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(
      <AddSignerDropdown ref={ref} contacts={CONTACTS} onPick={noop} onCreate={noop} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <AddSignerDropdown contacts={CONTACTS} onPick={noop} onCreate={noop} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
