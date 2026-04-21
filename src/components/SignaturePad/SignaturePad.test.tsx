import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignaturePad } from './SignaturePad';

describe('SignaturePad', () => {
  it('renders a tablist with three tabs and correct aria-selected', () => {
    renderWithTheme(<SignaturePad onCommit={vi.fn()} />);
    const tablist = screen.getByRole('tablist', { name: /signature mode/i });
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    const typeTab = screen.getByRole('tab', { name: 'Type' });
    const drawTab = screen.getByRole('tab', { name: 'Draw' });
    const uploadTab = screen.getByRole('tab', { name: 'Upload' });
    expect(typeTab).toHaveAttribute('aria-selected', 'true');
    expect(drawTab).toHaveAttribute('aria-selected', 'false');
    expect(uploadTab).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to the draw panel when the Draw tab is clicked', async () => {
    renderWithTheme(<SignaturePad onCommit={vi.fn()} />);
    expect(screen.getByLabelText(/type your name/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(screen.getByRole('img', { name: /signature canvas/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Draw' })).toHaveAttribute('aria-selected', 'true');
  });

  it('honours initialMode="draw"', () => {
    renderWithTheme(<SignaturePad onCommit={vi.fn()} initialMode="draw" />);
    expect(screen.getByRole('img', { name: /signature canvas/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Draw' })).toHaveAttribute('aria-selected', 'true');
  });

  it('hides the Draw tab when availableModes omits it', () => {
    renderWithTheme(<SignaturePad onCommit={vi.fn()} availableModes={['type', 'upload']} />);
    expect(screen.queryByRole('tab', { name: 'Draw' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Type' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Upload' })).toBeInTheDocument();
  });

  it('calls onCommit once with a typed value when TypeMode submits', async () => {
    const onCommit = vi.fn();
    renderWithTheme(<SignaturePad onCommit={onCommit} />);
    const input = screen.getByLabelText(/type your name/i);
    await userEvent.type(input, 'Jane{Enter}');
    expect(onCommit).toHaveBeenCalledTimes(1);
    const firstCall = onCommit.mock.calls[0];
    const arg = firstCall ? firstCall[0] : undefined;
    expect(arg).toEqual({ kind: 'typed', text: 'Jane', font: 'caveat' });
  });
});
