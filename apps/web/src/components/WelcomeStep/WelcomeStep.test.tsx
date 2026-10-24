import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { WelcomeStep } from './WelcomeStep';

function setup(onSubmit = vi.fn(async () => undefined), initialName?: string) {
  const utils = renderWithTheme(
    <WelcomeStep email="hannah@quill.vc" onSubmit={onSubmit} initialName={initialName} />,
  );
  return { ...utils, onSubmit };
}

describe('WelcomeStep', () => {
  it('greets the new user and shows the verified email', () => {
    const { getByRole, getByText } = setup();
    expect(getByRole('heading', { name: 'Welcome to Seald' })).toBeInTheDocument();
    expect(getByText('hannah@quill.vc')).toBeInTheDocument();
  });

  it('keeps Create account disabled until the name has 2+ characters and terms are ticked', () => {
    const { getByRole } = setup();
    const create = getByRole('button', { name: 'Create account' });
    expect(create).toBeDisabled();
    fireEvent.change(getByRole('textbox', { name: 'Full name' }), { target: { value: 'H' } });
    fireEvent.click(getByRole('checkbox', { name: /agree to the terms and privacy policy/i }));
    expect(create).toBeDisabled();
    fireEvent.change(getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Hannah Wills' },
    });
    expect(create).toBeEnabled();
  });

  it('submits the trimmed name', async () => {
    const { getByRole, onSubmit } = setup();
    fireEvent.change(getByRole('textbox', { name: 'Full name' }), {
      target: { value: '  Hannah Wills ' },
    });
    fireEvent.click(getByRole('checkbox', { name: /agree to the terms/i }));
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Create account' }));
    });
    expect(onSubmit).toHaveBeenCalledWith('Hannah Wills');
  });

  it('pre-fills a known name', () => {
    const { getByRole } = setup(undefined, 'Hannah Wills');
    expect(getByRole('textbox', { name: 'Full name' })).toHaveValue('Hannah Wills');
  });

  it('links Terms and Privacy Policy', () => {
    const { getByRole } = setup();
    expect(getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/legal/terms');
    expect(getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/legal/privacy');
  });

  it('shows an error banner and stays editable when saving fails', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('Could not save');
    });
    const { getByRole } = setup(onSubmit, 'Hannah Wills');
    fireEvent.click(getByRole('checkbox', { name: /agree to the terms/i }));
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Create account' }));
    });
    await waitFor(() => expect(getByRole('alert')).toHaveTextContent('Could not save'));
    expect(getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
