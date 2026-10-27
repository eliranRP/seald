import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MagicLinkForm } from './MagicLinkForm';
import type { MagicLinkFormProps } from './MagicLinkForm.types';

function Harness(props: Partial<MagicLinkFormProps> & { readonly initial?: string }) {
  const { initial = '', ...rest } = props;
  const [email, setEmail] = useState(initial);
  return (
    <MagicLinkForm
      email={email}
      onEmailChange={setEmail}
      onSubmit={vi.fn()}
      onGoogle={vi.fn()}
      {...rest}
    />
  );
}

describe('MagicLinkForm', () => {
  it('shows the combined title, Google first, then the email field', () => {
    const { getByRole } = renderWithTheme(<Harness />);
    expect(getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
  });

  it('keeps the primary button live when empty, then names the missing email and focuses it', () => {
    const onSubmit = vi.fn();
    const { getByRole } = renderWithTheme(<Harness onSubmit={onSubmit} />);
    const primary = getByRole('button', { name: 'Email me a sign-in link' });
    expect(primary).toBeEnabled();
    fireEvent.click(primary);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByRole('alert')).toHaveTextContent('Enter your email address');
    expect(getByRole('textbox', { name: 'Email' })).toHaveFocus();
  });

  it('submits a trimmed, valid email', () => {
    const onSubmit = vi.fn();
    const { getByRole } = renderWithTheme(
      <Harness initial="  hannah@quill.vc " onSubmit={onSubmit} />,
    );
    fireEvent.click(getByRole('button', { name: 'Email me a sign-in link' }));
    expect(onSubmit).toHaveBeenCalledWith('hannah@quill.vc');
  });

  it('shows the inline error for a bad email, sends nothing, and clears it on typing', () => {
    const onSubmit = vi.fn();
    const { getByRole, queryByText } = renderWithTheme(
      <Harness initial="hannah@quill" onSubmit={onSubmit} />,
    );
    fireEvent.click(getByRole('button', { name: 'Email me a sign-in link' }));
    expect(getByRole('alert')).toHaveTextContent('Check the email address');
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(getByRole('textbox', { name: 'Email' }), {
      target: { value: 'hannah@quill.vc' },
    });
    expect(queryByText('Check the email address')).not.toBeInTheDocument();
  });

  it('calls onGoogle', () => {
    const onGoogle = vi.fn();
    const { getByRole } = renderWithTheme(<Harness onGoogle={onGoogle} />);
    fireEvent.click(getByRole('button', { name: /continue with google/i }));
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });

  it('shows Sending and ignores submit while sending', () => {
    const onSubmit = vi.fn();
    const { getByRole } = renderWithTheme(
      <Harness initial="hannah@quill.vc" sending onSubmit={onSubmit} />,
    );
    const primary = getByRole('button', { name: 'Sending…' });
    fireEvent.click(primary);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the primary button when locked by the rate limit', () => {
    const { getByRole } = renderWithTheme(<Harness initial="hannah@quill.vc" locked />);
    expect(getByRole('button', { name: 'Email me a sign-in link' })).toBeDisabled();
  });

  it('renders a notice banner and a custom submit label', () => {
    const { getByRole } = renderWithTheme(
      <Harness
        initial="hannah@quill.vc"
        notice={{ tone: 'error', text: 'That sign-in link expired. Send a new one.' }}
        submitLabel="Email me a new link"
      />,
    );
    expect(getByRole('alert')).toHaveTextContent('That sign-in link expired');
    expect(getByRole('button', { name: 'Email me a new link' })).toBeEnabled();
  });

  it('shows the guest link only when onGuest is given', () => {
    const onGuest = vi.fn();
    const { getByRole, rerender, queryByRole } = renderWithTheme(<Harness onGuest={onGuest} />);
    fireEvent.click(getByRole('button', { name: 'Try without an account' }));
    expect(onGuest).toHaveBeenCalledTimes(1);
    rerender(<Harness />);
    expect(queryByRole('button', { name: 'Try without an account' })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Harness onGuest={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
