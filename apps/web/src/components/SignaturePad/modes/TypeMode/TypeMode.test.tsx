import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TypeMode } from './TypeMode';

describe('TypeMode', () => {
  it('renders a text input labelled "Type your name"', () => {
    renderWithTheme(<TypeMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/type your name/i)).toBeInTheDocument();
  });

  it('commits on Enter with a typed value', async () => {
    const onCommit = vi.fn();
    renderWithTheme(<TypeMode onCommit={onCommit} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/type your name/i);
    await userEvent.type(input, 'Jamie{Enter}');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'typed', text: 'Jamie', font: 'caveat' });
  });

  it('commits exactly once when Enter is followed by blur', async () => {
    const onCommit = vi.fn();
    renderWithTheme(<TypeMode onCommit={onCommit} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/type your name/i);
    await userEvent.type(input, 'Jamie{Enter}');
    // Simulate losing focus after Enter (previously caused a second commit).
    input.blur();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not commit empty text', async () => {
    const onCommit = vi.fn();
    renderWithTheme(<TypeMode onCommit={onCommit} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/type your name/i);
    await userEvent.type(input, '   {Enter}');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('renders a script-font preview of the typed text', async () => {
    renderWithTheme(<TypeMode onCommit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/type your name/i);
    await userEvent.type(input, 'Jamie');
    // no semantic role: preview is aria-hidden decorative text (rule 4.6 escape hatch)
    expect(screen.getByTestId('type-mode-preview')).toHaveTextContent('Jamie');
  });
});
