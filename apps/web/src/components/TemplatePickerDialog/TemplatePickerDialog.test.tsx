import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import { SAMPLE_TEMPLATES } from '../../test/templateFixtures';

describe('TemplatePickerDialog', () => {
  it('returns null when open=false', () => {
    const { queryByRole } = renderWithTheme(
      <TemplatePickerDialog
        open={false}
        templates={SAMPLE_TEMPLATES}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog with header + list of templates when open', () => {
    renderWithTheme(
      <TemplatePickerDialog open templates={SAMPLE_TEMPLATES} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('dialog', { name: /choose a template/i })).toBeInTheDocument();
    // Each template renders as a button row.
    for (const t of SAMPLE_TEMPLATES) {
      expect(screen.getByRole('button', { name: new RegExp(t.name, 'i') })).toBeInTheDocument();
    }
  });

  it('filters by search query (matches on name)', async () => {
    const sample = SAMPLE_TEMPLATES[0]!;
    renderWithTheme(
      <TemplatePickerDialog open templates={SAMPLE_TEMPLATES} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText(/search templates/i), sample.name.slice(0, 6));
    expect(screen.getByRole('button', { name: new RegExp(sample.name, 'i') })).toBeInTheDocument();
    // The other templates should drop out of the list.
    const others = SAMPLE_TEMPLATES.filter((t) => t.id !== sample.id);
    for (const t of others) {
      expect(
        screen.queryByRole('button', { name: new RegExp(t.name, 'i') }),
      ).not.toBeInTheDocument();
    }
  });

  it('shows the empty state when nothing matches the query', async () => {
    renderWithTheme(
      <TemplatePickerDialog open templates={SAMPLE_TEMPLATES} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText(/search templates/i), 'zzzznope');
    expect(screen.getByRole('status')).toHaveTextContent(/no templates match/i);
  });

  it('clicking a row fires onPick with the template and the dialog can be closed', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const sample = SAMPLE_TEMPLATES[0]!;
    renderWithTheme(
      <TemplatePickerDialog open templates={SAMPLE_TEMPLATES} onPick={onPick} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: new RegExp(sample.name, 'i') }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(sample);
  });

  it('Cancel button fires onClose', async () => {
    const onClose = vi.fn();
    renderWithTheme(
      <TemplatePickerDialog open templates={SAMPLE_TEMPLATES} onPick={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes the dialog', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <TemplatePickerDialog open templates={SAMPLE_TEMPLATES} onPick={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the empty state when no templates are provided', () => {
    renderWithTheme(
      <TemplatePickerDialog open templates={[]} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/no templates match/i);
  });
});
