import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';

describe('SaveAsTemplateDialog', () => {
  it('returns null when open=false', () => {
    const { queryByRole } = renderWithTheme(
      <SaveAsTemplateDialog open={false} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog with the title prefilled from defaults', () => {
    const { getByRole, getByLabelText } = renderWithTheme(
      <SaveAsTemplateDialog open defaultTitle="Mutual NDA" onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(getByRole('dialog', { name: /save as template/i })).toBeInTheDocument();
    expect(getByLabelText(/template name/i)).toHaveValue('Mutual NDA');
  });

  it('disables Save until the title is non-empty', async () => {
    const onSave = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <SaveAsTemplateDialog open onSave={onSave} onCancel={vi.fn()} />,
    );
    const save = getByRole('button', { name: /save template/i });
    expect(save).toBeDisabled();
    await userEvent.type(getByLabelText(/template name/i), 'My template');
    expect(save).toBeEnabled();
  });

  it('submitting fires onSave with trimmed title + description', async () => {
    const onSave = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <SaveAsTemplateDialog open onSave={onSave} onCancel={vi.fn()} />,
    );
    await userEvent.type(getByLabelText(/template name/i), '  Photography release  ');
    await userEvent.type(getByLabelText(/description/i), '  Standard release  ');
    await userEvent.click(getByRole('button', { name: /save template/i }));
    expect(onSave).toHaveBeenCalledWith({
      title: 'Photography release',
      description: 'Standard release',
    });
  });

  it('Cancel button fires onCancel', async () => {
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <SaveAsTemplateDialog open onSave={vi.fn()} onCancel={onCancel} />,
    );
    await userEvent.click(getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
