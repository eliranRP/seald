import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FieldsPlacedList } from './FieldsPlacedList';
import type { FieldsPlacedListItem, FieldsPlacedListSigner } from './FieldsPlacedList.types';

const SIGNERS: ReadonlyArray<FieldsPlacedListSigner> = [
  { id: 'you', name: 'You', color: '#4F46E5' },
  { id: 'ana', name: 'Ana Torres', color: '#10B981' },
  { id: 'ben', name: 'Ben Lee', color: '#F59E0B' },
  { id: 'cara', name: 'Cara Diaz', color: '#EF4444' },
  { id: 'dan', name: 'Dan Kim', color: '#3B82F6' },
];

const FIELDS: ReadonlyArray<FieldsPlacedListItem> = [
  { id: 'f1', type: 'signature', page: 1, signerIds: ['you'] },
  { id: 'f2', type: 'date', page: 4, signerIds: ['ana'] },
  { id: 'f3', type: 'text', page: 2, signerIds: ['you', 'ana'] },
];

describe('FieldsPlacedList', () => {
  it('renders the empty hint and no rows when fields is empty', () => {
    const { getByRole, queryAllByRole } = renderWithTheme(
      <FieldsPlacedList fields={[]} signers={SIGNERS} />,
    );
    expect(getByRole('status')).toHaveTextContent(
      'Drag a field from the left onto the page to get started.',
    );
    expect(queryAllByRole('listitem')).toHaveLength(0);
  });

  it('renders one row per field', () => {
    const { getAllByRole } = renderWithTheme(
      <FieldsPlacedList fields={FIELDS} signers={SIGNERS} />,
    );
    expect(getAllByRole('listitem')).toHaveLength(3);
  });

  it('each row shows the correct label and page tag', () => {
    const { getByRole } = renderWithTheme(<FieldsPlacedList fields={FIELDS} signers={SIGNERS} />);
    const sig = getByRole('button', { name: /Signature on page 1/ });
    expect(sig).toHaveTextContent('Signature');
    expect(sig).toHaveTextContent('p1');
    const dateBtn = getByRole('button', { name: /Date on page 4/ });
    expect(dateBtn).toHaveTextContent('Date');
    expect(dateBtn).toHaveTextContent('p4');
    const textBtn = getByRole('button', { name: /Text on page 2/ });
    expect(textBtn).toHaveTextContent('Text');
    expect(textBtn).toHaveTextContent('p2');
  });

  it('click fires onSelectField with the field id', async () => {
    const onSelectField = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldsPlacedList fields={FIELDS} signers={SIGNERS} onSelectField={onSelectField} />,
    );
    await userEvent.click(getByRole('button', { name: /Date on page 4/ }));
    expect(onSelectField).toHaveBeenCalledTimes(1);
    const first = onSelectField.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('f2');
  });

  it('row matching selectedFieldId has aria-current="true"', () => {
    const { getByRole } = renderWithTheme(
      <FieldsPlacedList fields={FIELDS} signers={SIGNERS} selectedFieldId="f3" />,
    );
    const selected = getByRole('button', { name: /Text on page 2/ });
    expect(selected.getAttribute('aria-current')).toBe('true');
    const other = getByRole('button', { name: /Signature on page 1/ });
    expect(other.getAttribute('aria-current')).toBeNull();
  });

  it('caps avatars at 3 for a field with 5 signers', () => {
    const manySigners: FieldsPlacedListItem = {
      id: 'f-many',
      type: 'signature',
      page: 1,
      signerIds: ['you', 'ana', 'ben', 'cara', 'dan'],
    };
    const { getByRole } = renderWithTheme(
      <FieldsPlacedList fields={[manySigners]} signers={SIGNERS} />,
    );
    const row = getByRole('button');
    expect(row).toHaveTextContent('AT');
    expect(row).toHaveTextContent('BL');
    expect(row.textContent ?? '').not.toContain('CD');
    expect(row.textContent ?? '').not.toContain('DK');
  });

  it('forwards ref to the root section element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(<FieldsPlacedList ref={ref} fields={[]} signers={SIGNERS} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('SECTION');
  });

  it('has no axe violations in empty state', async () => {
    const { container } = renderWithTheme(<FieldsPlacedList fields={[]} signers={SIGNERS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations when populated with selected row', async () => {
    const { container } = renderWithTheme(
      <FieldsPlacedList
        fields={FIELDS}
        signers={SIGNERS}
        selectedFieldId="f1"
        onSelectField={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
