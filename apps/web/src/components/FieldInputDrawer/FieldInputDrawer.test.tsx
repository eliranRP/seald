import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FieldInputDrawer } from './FieldInputDrawer';

describe('FieldInputDrawer', () => {
  it('renders nothing when closed', () => {
    const { queryByRole } = renderWithTheme(
      <FieldInputDrawer
        open={false}
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders label + typed input when open', () => {
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(getByRole('dialog', { name: /job title/i })).toBeInTheDocument();
    expect(getByRole('textbox', { name: 'Job title' })).toBeInTheDocument();
  });

  it('Apply is disabled when value is empty', () => {
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('email kind rejects bad email with an alert', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer open kind="email" label="Email" onCancel={() => {}} onApply={onApply} />,
    );
    await userEvent.type(getByRole('textbox', { name: 'Email' }), 'not-an-email');
    await userEvent.click(getByRole('button', { name: /apply/i }));
    expect(getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('valid text submits the trimmed value', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer open kind="text" label="Job title" onCancel={() => {}} onApply={onApply} />,
    );
    await userEvent.type(getByRole('textbox', { name: 'Job title' }), '  Engineer  ');
    await userEvent.click(getByRole('button', { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith('Engineer');
  });

  it('Enter submits', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <FieldInputDrawer open kind="text" label="Job title" onCancel={() => {}} onApply={onApply} />,
    );
    const input = getByRole('textbox', { name: 'Job title' });
    await userEvent.type(input, 'Lead{Enter}');
    expect(onApply).toHaveBeenCalledWith('Lead');
  });

  it('Escape fires onCancel', async () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={onCancel}
        onApply={() => {}}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('axe clean', async () => {
    const { container } = renderWithTheme(
      <FieldInputDrawer
        open
        kind="text"
        label="Job title"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
