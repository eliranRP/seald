import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FieldPalette } from './FieldPalette';
import { FIELD_KINDS } from '../../types/sealdTypes';

describe('FieldPalette', () => {
  it('renders Required section with Signature and Initials by default', () => {
    const { getByRole, getByText } = renderWithTheme(<FieldPalette />);
    expect(getByText('Required fields')).toBeDefined();
    expect(getByRole('button', { name: 'Signature' })).toBeDefined();
    expect(getByRole('button', { name: 'Initials' })).toBeDefined();
  });

  it('renders Optional section with Date, Text, Checkbox, and Email by default', () => {
    const { getByRole, getByText } = renderWithTheme(<FieldPalette />);
    expect(getByText('Optional fields')).toBeDefined();
    expect(getByRole('button', { name: 'Date' })).toBeDefined();
    expect(getByRole('button', { name: 'Text' })).toBeDefined();
    expect(getByRole('button', { name: 'Checkbox' })).toBeDefined();
    expect(getByRole('button', { name: 'Email' })).toBeDefined();
  });

  it('fires onFieldDragStart(kind, event) when a row is dragged', () => {
    const onFieldDragStart = vi.fn();
    const { getByRole } = renderWithTheme(<FieldPalette onFieldDragStart={onFieldDragStart} />);
    const row = getByRole('button', { name: 'Signature' });
    fireEvent.dragStart(row);
    expect(onFieldDragStart).toHaveBeenCalledTimes(1);
    const first = onFieldDragStart.mock.calls[0];
    const kind = first ? first[0] : undefined;
    expect(kind).toBe('signature');
  });

  it('fires onFieldActivate on Enter keypress', async () => {
    const onFieldActivate = vi.fn();
    const { getByRole } = renderWithTheme(<FieldPalette onFieldActivate={onFieldActivate} />);
    const row = getByRole('button', { name: 'Initials' });
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(onFieldActivate).toHaveBeenCalledTimes(1);
    const first = onFieldActivate.mock.calls[0];
    const kind = first ? first[0] : undefined;
    expect(kind).toBe('initials');
  });

  it('fires onFieldActivate on Space keypress', async () => {
    const onFieldActivate = vi.fn();
    const { getByRole } = renderWithTheme(<FieldPalette onFieldActivate={onFieldActivate} />);
    const row = getByRole('button', { name: 'Date' });
    row.focus();
    await userEvent.keyboard(' ');
    expect(onFieldActivate).toHaveBeenCalledTimes(1);
    const first = onFieldActivate.mock.calls[0];
    const kind = first ? first[0] : undefined;
    expect(kind).toBe('date');
  });

  it('custom requiredKinds moves kinds between sections', () => {
    const { getAllByRole, getByText } = renderWithTheme(
      <FieldPalette requiredKinds={['date', 'email']} />,
    );
    const requiredHeader = getByText('Required fields');
    const optionalHeader = getByText('Optional fields');
    expect(requiredHeader).toBeDefined();
    expect(optionalHeader).toBeDefined();

    const rows = getAllByRole('button');
    const orderedLabels = rows.map((r) => r.getAttribute('aria-label'));
    // Required first (signature & initials are NOT required now; date & email are).
    // Default `kinds` is FIELD_KINDS = [signature, initials, date, text, checkbox, email]
    // Required filtered in source order: [date, email]
    // Optional filtered: [signature, initials, text, checkbox]
    expect(orderedLabels).toEqual(['Date', 'Email', 'Signature', 'Initials', 'Text', 'Checkbox']);
  });

  it('custom hint ReactNode replaces the default hint', () => {
    const { getByTestId, queryByText } = renderWithTheme(
      <FieldPalette hint={<div data-testid="custom-hint">Custom</div>} />,
    );
    expect(getByTestId('custom-hint')).toBeDefined();
    expect(queryByText(/Drag a field onto the page/)).toBeNull();
  });

  it('forwards ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<FieldPalette ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <FieldPalette kinds={FIELD_KINDS} onFieldDragStart={() => {}} onFieldActivate={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
