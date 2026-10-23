import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessCodeSendResponse } from 'shared';
import { seald } from '@/styles/theme';
import { AccessCodeForm, normalizeCodeInput } from './AccessCodeForm';

const SENT: AccessCodeSendResponse = {
  status: 'sent',
  purpose: 'access',
  email_masked: 'j***@example.com',
  expires_in_seconds: 600,
  resend_after_seconds: 60,
};

const apiError = (status: number, code: string, retryAfterSeconds?: number) =>
  Object.assign(new Error(code), {
    status,
    code,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });

function setup(overrides: Partial<Parameters<typeof AccessCodeForm>[0]> = {}) {
  const sendCode = vi.fn().mockResolvedValue(SENT);
  const onSubmitCode = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const view = render(
    <ThemeProvider theme={seald}>
      <AccessCodeForm
        purpose="access"
        emailMasked="j***@example.com"
        submitLabel="Continue"
        sendCode={sendCode}
        onSubmitCode={onSubmitCode}
        {...overrides}
      />
    </ThemeProvider>,
  );
  return { sendCode, onSubmitCode, user, ...view };
}

async function sendAndGetInput(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  return screen.findByRole('textbox', { name: /one-time code/i });
}

describe('AccessCodeForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the masked email and a Send code button, no input', () => {
    setup();
    expect(screen.getByText('j***@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('uses wording about an emailed one-time code, never identity', () => {
    const { container } = setup();
    expect(container.textContent).toMatch(/one-time code/i);
    expect(container.textContent).not.toMatch(/identity|verified/i);
  });

  it('sends a code, then offers a one-time-code input and a Resend countdown', async () => {
    const { sendCode, user } = setup();
    const input = await sendAndGetInput(user);
    expect(sendCode).toHaveBeenCalledWith('access');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('status')).toHaveTextContent('A code was emailed to j***@example.com.');
    const resend = screen.getByRole('button', { name: 'Resend code in 60s' });
    expect(resend).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('button', { name: 'Resend code in 55s' })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(55_000);
    });
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
  });

  it('keeps digits only, so a pasted "123 456" fills all six', async () => {
    const { user } = setup();
    const input = await sendAndGetInput(user);
    await user.click(input);
    await user.paste('123 456');
    expect(input).toHaveValue('123456');
    expect(normalizeCodeInput('12-34 56 78')).toBe('123456');
  });

  it('keeps Continue disabled until six digits, then submits them', async () => {
    const { user, onSubmitCode } = setup();
    const input = await sendAndGetInput(user);
    const go = screen.getByRole('button', { name: 'Continue' });
    await user.type(input, '12345');
    expect(go).toBeDisabled();
    await user.type(input, '6');
    expect(go).toBeEnabled();
    await user.click(go);
    expect(onSubmitCode).toHaveBeenCalledWith('123456');
  });

  it('explains a wrong code and lets the signer try again', async () => {
    const { user, onSubmitCode } = setup();
    onSubmitCode.mockRejectedValueOnce(apiError(422, 'access_code_invalid'));
    const input = await sendAndGetInput(user);
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not right/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('');
    expect(input).toHaveAccessibleDescription(/not right/i);
  });

  it('shows the lockout and asks for a new code', async () => {
    const { user, onSubmitCode, sendCode } = setup();
    onSubmitCode.mockRejectedValueOnce(apiError(423, 'access_code_locked'));
    const input = await sendAndGetInput(user);
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many incorrect codes/i);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The cooldown from the first send is still running; a new code waits for it.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(sendCode).toHaveBeenCalledTimes(2);
  });

  it.each([
    [410, 'access_code_expired', /expired/i],
    [409, 'access_code_not_requested', /no active code/i],
  ] as const)('asks for a new code on %s %s', async (status, code, text) => {
    const { user, onSubmitCode } = setup();
    onSubmitCode.mockRejectedValueOnce(apiError(status, code));
    const input = await sendAndGetInput(user);
    await user.type(input, '111111');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: /send a new code/i })).toBeInTheDocument();
  });

  it('counts down from Retry-After when a send is too soon (429 cooldown)', async () => {
    const { user, sendCode } = setup();
    sendCode.mockRejectedValueOnce(apiError(429, 'access_code_cooldown', 30));
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/just sent/i);
    // A live code may exist, so the input is offered.
    expect(screen.getByRole('textbox', { name: /one-time code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code in 30s' })).toBeDisabled();
  });

  it('shows the hourly limit with a wait time (429 rate limited)', async () => {
    const { user, sendCode } = setup();
    sendCode.mockRejectedValueOnce(apiError(429, 'access_code_rate_limited', 1500));
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/about 25 minutes/i);
    expect(screen.getByRole('button', { name: /send code in/i })).toBeDisabled();
  });

  it('says codes are unavailable on 503', async () => {
    const { user, sendCode } = setup();
    sendCode.mockRejectedValueOnce(apiError(503, 'access_code_unavailable'));
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available right now/i);
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  it('uses the action wording for the re-check', () => {
    setup({ purpose: 'action', submitLabel: 'Sign and submit' });
    expect(screen.getByText(/fresh code before you sign/i)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container, user } = setup();
    await sendAndGetInput(user);
    expect(await axe(container)).toHaveNoViolations();
  });
});
