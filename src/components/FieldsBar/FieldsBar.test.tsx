import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FieldsBar } from './FieldsBar';
import type { FieldsBarSigner } from './FieldsBar.types';

const SIGNERS: ReadonlyArray<FieldsBarSigner> = [
  { id: 'you', name: 'You', email: 'jamie@sealed.co' },
  { id: 'ana', name: 'Ana Torres', email: 'ana@farrow.law' },
];

describe('FieldsBar', () => {
  it('renders all 6 default field tiles with correct labels', () => {
    const { getByRole } = renderWithTheme(<FieldsBar />);
    expect(getByRole('button', { name: /Drag Signature field/ })).toBeDefined();
    expect(getByRole('button', { name: /Drag Initial field/ })).toBeDefined();
    expect(getByRole('button', { name: /Drag Date field/ })).toBeDefined();
    expect(getByRole('button', { name: /Drag Text field/ })).toBeDefined();
    expect(getByRole('button', { name: /Drag Checkbox field/ })).toBeDefined();
    expect(getByRole('button', { name: /Drag Email field/ })).toBeDefined();
  });

  it('filters to only requested field kinds', () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <FieldsBar fieldKinds={['signature', 'date']} />,
    );
    expect(getByRole('button', { name: /Drag Signature field/ })).toBeDefined();
    expect(getByRole('button', { name: /Drag Date field/ })).toBeDefined();
    expect(queryByRole('button', { name: /Drag Initial field/ })).toBeNull();
    expect(queryByRole('button', { name: /Drag Email field/ })).toBeNull();
  });

  it('fires onFieldDragStart with the kind when a tile is dragged', () => {
    const onFieldDragStart = vi.fn();
    const { getByRole } = renderWithTheme(<FieldsBar onFieldDragStart={onFieldDragStart} />);
    const tile = getByRole('button', { name: /Drag Signature field/ });
    fireEvent.dragStart(tile);
    expect(onFieldDragStart).toHaveBeenCalledTimes(1);
    const first = onFieldDragStart.mock.calls[0];
    const kind = first ? first[0] : undefined;
    expect(kind).toBe('signature');
  });

  it('fires onFieldActivate on Enter keypress on a tile', async () => {
    const onFieldActivate = vi.fn();
    const { getByRole } = renderWithTheme(<FieldsBar onFieldActivate={onFieldActivate} />);
    const tile = getByRole('button', { name: /Drag Initial field/ });
    tile.focus();
    await userEvent.keyboard('{Enter}');
    expect(onFieldActivate).toHaveBeenCalledTimes(1);
    const first = onFieldActivate.mock.calls[0];
    const kind = first ? first[0] : undefined;
    expect(kind).toBe('initials');
  });

  it('renders signers and fires onSelectSigner(id) on click', async () => {
    const onSelectSigner = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldsBar signers={SIGNERS} onSelectSigner={onSelectSigner} />,
    );
    const ana = getByRole('button', { name: /Ana Torres/ });
    await userEvent.click(ana);
    expect(onSelectSigner).toHaveBeenCalledTimes(1);
    const first = onSelectSigner.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('ana');
  });

  it('renders the Add signer button only when onAddSigner is provided', async () => {
    const onAddSigner = vi.fn();
    const { getByRole, queryByRole, rerender } = renderWithTheme(<FieldsBar signers={SIGNERS} />);
    expect(queryByRole('button', { name: 'Add signer' })).toBeNull();
    rerender(<FieldsBar signers={SIGNERS} onAddSigner={onAddSigner} />);
    const addBtn = getByRole('button', { name: 'Add signer' });
    await userEvent.click(addBtn);
    expect(onAddSigner).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations with signers and default tiles', async () => {
    const { container } = renderWithTheme(
      <FieldsBar signers={SIGNERS} onAddSigner={() => {}} onSelectSigner={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the underlying <aside> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(<FieldsBar ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('ASIDE');
  });
});
