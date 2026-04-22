import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignersPanel } from './SignersPanel';
import type { SignersPanelSigner } from './SignersPanel.types';

const SIGNERS: ReadonlyArray<SignersPanelSigner> = [
  { id: 'you', name: 'Jamie Rivera', email: 'jamie@sealed.co', color: '#4F46E5' },
  { id: 'ana', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
];

describe('SignersPanel', () => {
  it('shows a count of 0 and no chips when signers list is empty', () => {
    const { getByText, queryAllByRole } = renderWithTheme(<SignersPanel signers={[]} />);
    expect(getByText('0')).toBeDefined();
    const list = queryAllByRole('list');
    expect(list.length).toBe(1);
    const listItems = queryAllByRole('listitem');
    expect(listItems.length).toBe(0);
  });

  it('renders one chip per signer showing the first name', () => {
    const { getByText } = renderWithTheme(<SignersPanel signers={SIGNERS} />);
    expect(getByText('Jamie')).toBeDefined();
    expect(getByText('Ana')).toBeDefined();
    expect(getByText('2')).toBeDefined();
  });

  it('fires onRequestAdd when the add button is clicked', async () => {
    const onRequestAdd = vi.fn();
    const { getByRole } = renderWithTheme(
      <SignersPanel signers={SIGNERS} onRequestAdd={onRequestAdd} />,
    );
    const addBtn = getByRole('button', { name: 'Add signer' });
    await userEvent.click(addBtn);
    expect(onRequestAdd).toHaveBeenCalledTimes(1);
  });

  it('does not render the add button when onRequestAdd is undefined', () => {
    const { queryByRole } = renderWithTheme(<SignersPanel signers={SIGNERS} />);
    expect(queryByRole('button', { name: 'Add signer' })).toBeNull();
  });

  it('fires onSelectSigner(id) when a chip is clicked', async () => {
    const onSelectSigner = vi.fn();
    const { getByRole } = renderWithTheme(
      <SignersPanel signers={SIGNERS} onSelectSigner={onSelectSigner} />,
    );
    const anaChip = getByRole('button', { name: 'Ana Torres, ana@farrow.law' });
    await userEvent.click(anaChip);
    expect(onSelectSigner).toHaveBeenCalledTimes(1);
    const first = onSelectSigner.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('ana');
  });

  it('renders chips as non-buttons when onSelectSigner is undefined', () => {
    const { queryByRole } = renderWithTheme(<SignersPanel signers={SIGNERS} />);
    expect(queryByRole('button', { name: /Jamie Rivera/ })).toBeNull();
    expect(queryByRole('button', { name: /Ana Torres/ })).toBeNull();
  });

  it('forwards ref to the underlying <section> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(<SignersPanel ref={ref} signers={SIGNERS} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('SECTION');
  });

  it('has no axe violations in the populated default state', async () => {
    const { container } = renderWithTheme(
      <SignersPanel signers={SIGNERS} onRequestAdd={() => {}} onSelectSigner={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a remove button per chip and fires onRemoveSigner(id) when clicked', async () => {
    const onRemoveSigner = vi.fn<(id: string) => void>();
    const { getByRole, getAllByRole } = renderWithTheme(
      <SignersPanel signers={SIGNERS} onRemoveSigner={onRemoveSigner} />,
    );
    const removeButtons = getAllByRole('button', { name: /^Remove signer/i });
    expect(removeButtons).toHaveLength(2);
    const removeAna = getByRole('button', { name: /Remove signer Ana Torres/ });
    await userEvent.click(removeAna);
    expect(onRemoveSigner).toHaveBeenCalledTimes(1);
    const first = onRemoveSigner.mock.calls[0];
    expect(first ? first[0] : undefined).toBe('ana');
  });

  it('does not render remove buttons when onRemoveSigner is undefined', () => {
    const { queryAllByRole } = renderWithTheme(<SignersPanel signers={SIGNERS} />);
    expect(queryAllByRole('button', { name: /^Remove signer/i })).toHaveLength(0);
  });
});
