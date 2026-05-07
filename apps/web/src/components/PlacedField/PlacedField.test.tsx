import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PlacedField } from './PlacedField';
import type { PlacedFieldSigner, PlacedFieldValue } from './PlacedField.types';
import type { FieldKind } from '../../types/sealdTypes';

const SIGNERS: ReadonlyArray<PlacedFieldSigner> = [
  { id: 's1', name: 'Ana Torres', color: '#F472B6' },
  { id: 's2', name: 'Ben Chen', color: '#34D399' },
];

function makeField(overrides: Partial<PlacedFieldValue> = {}): PlacedFieldValue {
  return {
    id: 'f1',
    page: 0,
    type: 'signature',
    x: 20,
    y: 30,
    signerIds: ['s1'],
    ...overrides,
  };
}

describe('PlacedField', () => {
  it('renders field label + icon for each kind', () => {
    const kinds: ReadonlyArray<{ readonly kind: FieldKind; readonly label: string }> = [
      { kind: 'signature', label: 'Signature' },
      { kind: 'initials', label: 'Initials' },
      { kind: 'date', label: 'Date' },
      { kind: 'text', label: 'Text' },
      { kind: 'checkbox', label: 'Checkbox' },
      { kind: 'email', label: 'Email' },
    ];
    for (const { kind, label } of kinds) {
      const { getAllByText, container, unmount } = renderWithTheme(
        <PlacedField field={makeField({ type: kind })} signers={SIGNERS} />,
      );
      if (kind === 'checkbox') {
        // Compact checkbox tile doesn't render text; check via aria-label
        expect(container.querySelector('[aria-label*="Checkbox"]')).toBeTruthy();
      } else {
        expect(getAllByText(label).length).toBeGreaterThan(0);
      }
      unmount();
    }
  });

  it('renders one tile for a single signer', () => {
    const { getAllByText } = renderWithTheme(
      <PlacedField field={makeField({ signerIds: ['s1'] })} signers={SIGNERS} />,
    );
    expect(getAllByText('Signature')).toHaveLength(1);
  });

  it('renders two tiles for multi-signer fields', () => {
    const { getAllByText } = renderWithTheme(
      <PlacedField field={makeField({ signerIds: ['s1', 's2'] })} signers={SIGNERS} />,
    );
    expect(getAllByText('Signature')).toHaveLength(2);
  });

  it('selected state reveals assign + duplicate + delete buttons', () => {
    const { getByRole } = renderWithTheme(
      <PlacedField field={makeField()} signers={SIGNERS} selected />,
    );
    expect(getByRole('button', { name: 'Assign signers' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Duplicate field to pages' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Delete field' })).toBeInTheDocument();
  });

  it('inGroup state hides selection controls (dashed overlay only)', () => {
    const { queryByRole } = renderWithTheme(
      <PlacedField field={makeField()} signers={SIGNERS} selected inGroup />,
    );
    expect(queryByRole('button', { name: 'Assign signers' })).toBeNull();
    expect(queryByRole('button', { name: 'Delete field' })).toBeNull();
  });

  it('clicking the assign bubble fires onOpenSignerPopover', () => {
    const onOpenSignerPopover = vi.fn();
    const { getByRole } = renderWithTheme(
      <PlacedField
        field={makeField()}
        signers={SIGNERS}
        selected
        onOpenSignerPopover={onOpenSignerPopover}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Assign signers' }));
    expect(onOpenSignerPopover).toHaveBeenCalledTimes(1);
  });

  it('clicking duplicate fires onOpenPagesPopover', () => {
    const onOpenPagesPopover = vi.fn();
    const { getByRole } = renderWithTheme(
      <PlacedField
        field={makeField()}
        signers={SIGNERS}
        selected
        onOpenPagesPopover={onOpenPagesPopover}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Duplicate field to pages' }));
    expect(onOpenPagesPopover).toHaveBeenCalledTimes(1);
  });

  it('clicking delete fires onRemove', () => {
    const onRemove = vi.fn();
    const { getByRole } = renderWithTheme(
      <PlacedField field={makeField()} signers={SIGNERS} selected onRemove={onRemove} />,
    );
    fireEvent.click(getByRole('button', { name: 'Delete field' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('mousedown + window mousemove emits onMove with expected deltas; mouseup fires onDragEnd', () => {
    const onMove = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { getByRole } = renderWithTheme(
      <PlacedField
        field={makeField({ x: 100, y: 50 })}
        signers={SIGNERS}
        onMove={onMove}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );
    const root = getByRole('group');
    fireEvent.mouseDown(root, { button: 0, clientX: 200, clientY: 100 });
    expect(onDragStart).toHaveBeenCalledTimes(1);

    const move = new MouseEvent('mousemove', { bubbles: true });
    Object.defineProperty(move, 'clientX', { value: 230 });
    Object.defineProperty(move, 'clientY', { value: 120 });
    window.dispatchEvent(move);

    expect(onMove).toHaveBeenCalled();
    const first = onMove.mock.calls[0];
    const [id, nx, ny] = first ?? [];
    expect(id).toBe('f1');
    expect(nx).toBe(130);
    expect(ny).toBe(70);

    const up = new MouseEvent('mouseup', { bubbles: true });
    window.dispatchEvent(up);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<PlacedField ref={ref} field={makeField()} signers={SIGNERS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards data-* rest props to root', () => {
    const { container } = renderWithTheme(
      <PlacedField field={makeField()} signers={SIGNERS} data-testid="placed-root" />,
    );
    expect(container.querySelector('[data-testid="placed-root"]')).not.toBeNull();
  });

  it('has no axe violations (default)', async () => {
    const { container } = renderWithTheme(<PlacedField field={makeField()} signers={SIGNERS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations (selected)', async () => {
    const { container } = renderWithTheme(
      <PlacedField field={makeField()} signers={SIGNERS} selected />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
