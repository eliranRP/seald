import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TemplateFlowHeader } from './TemplateFlowHeader';

describe('TemplateFlowHeader', () => {
  it('shows the name, the page count and the Template pill', () => {
    const { getByText, getByRole } = renderWithTheme(
      <TemplateFlowHeader mode="editing" templateName="NDA — standard" meta="3 pages" />,
    );
    expect(getByText('NDA — standard')).toBeInTheDocument();
    expect(getByText('3 pages')).toBeInTheDocument();
    expect(getByText('Template')).toBeInTheDocument();
    expect(getByRole('banner')).toBeInTheDocument();
  });

  it('labels the pill "From template" when sending a saved template', () => {
    const { getByText } = renderWithTheme(<TemplateFlowHeader mode="using" templateName="NDA" />);
    expect(getByText('From template')).toBeInTheDocument();
  });

  it('Cancel and the X both go back; Save template saves', async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateFlowHeader mode="new" templateName="NDA" onCancel={onCancel} onSave={onSave} />,
    );
    await userEvent.click(getByRole('button', { name: 'Cancel' }));
    await userEvent.click(getByRole('button', { name: /close and go back/i }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    await userEvent.click(getByRole('button', { name: 'Save template' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('has no Save button without onSave, and a custom label when given', () => {
    const first = renderWithTheme(<TemplateFlowHeader mode="using" templateName="NDA" />);
    expect(first.queryByRole('button', { name: 'Save template' })).toBeNull();
    first.unmount();
    const second = renderWithTheme(
      <TemplateFlowHeader mode="new" templateName="NDA" onSave={vi.fn()} saveLabel="Save" />,
    );
    expect(second.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renames inline: Enter commits, Escape reverts, an empty name is ignored', async () => {
    const onRename = vi.fn();
    const { getByRole } = renderWithTheme(
      <TemplateFlowHeader mode="editing" templateName="NDA" onRenameTemplate={onRename} />,
    );
    await userEvent.click(getByRole('button', { name: 'Rename template NDA' }));
    const input = getByRole('textbox', { name: 'Template name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'NDA v2{Enter}');
    expect(onRename).toHaveBeenLastCalledWith('NDA v2');

    await userEvent.click(getByRole('button', { name: 'Rename template NDA' }));
    await userEvent.type(getByRole('textbox', { name: 'Template name' }), 'zzz{Escape}');
    expect(getByRole('button', { name: 'Rename template NDA' })).toBeInTheDocument();
  });

  it('is not renamable without onRenameTemplate', () => {
    const { getByRole } = renderWithTheme(<TemplateFlowHeader mode="using" templateName="NDA" />);
    expect(getByRole('button', { name: 'NDA' })).toBeInTheDocument();
  });

  it('shows a spinner on Save while saving', () => {
    const { getByRole } = renderWithTheme(
      <TemplateFlowHeader mode="editing" templateName="NDA" onSave={vi.fn()} saving />,
    );
    expect(getByRole('button', { name: /save template/i })).toHaveAttribute('aria-busy', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <TemplateFlowHeader mode="editing" templateName="NDA" onCancel={vi.fn()} onSave={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
