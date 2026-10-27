import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CheckEmailPanel } from './CheckEmailPanel';
import { mailLinksFor } from './mailProviders';
import type { ResendResult } from './CheckEmailPanel.types';

async function tick(seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

function setup(result: ResendResult = 'ok', email = 'hannah@gmail.com') {
  const onResend = vi.fn(async () => result);
  const onChangeEmail = vi.fn();
  const utils = renderWithTheme(
    <CheckEmailPanel email={email} onResend={onResend} onChangeEmail={onChangeEmail} />,
  );
  return { ...utils, onResend, onChangeEmail };
}

describe('mailLinksFor', () => {
  it('maps Gmail and Outlook domains to their web inbox', () => {
    expect(mailLinksFor('a@gmail.com')[0]?.href).toBe('https://mail.google.com/');
    expect(mailLinksFor('a@googlemail.com')[0]?.label).toBe('Open Gmail');
    expect(mailLinksFor('a@hotmail.com')[0]?.href).toBe('https://outlook.live.com/mail/');
    expect(mailLinksFor('a@LIVE.com')[0]?.label).toBe('Open Outlook');
  });

  it('falls back to a single address-free mailto link for other domains', () => {
    const links = mailLinksFor('hannah@quill.vc');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ label: 'Open email app', href: 'mailto:', external: false });
  });
});

describe('CheckEmailPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces where the link went and offers the matching mail app', () => {
    const { getByRole } = setup();
    expect(getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(getByRole('status', { name: /sign-in link sent/i })).toHaveTextContent(
      'We sent a link to hannah@gmail.com',
    );
    const link = getByRole('link', { name: 'Open Gmail' });
    expect(link).toHaveAttribute('href', 'https://mail.google.com/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('counts the resend cooldown down from 0:30 and unlocks at zero', async () => {
    const { getByRole } = setup();
    expect(getByRole('button', { name: 'Resend in 0:30' })).toBeDisabled();
    await tick(10);
    expect(getByRole('button', { name: 'Resend in 0:20' })).toBeDisabled();
    await tick(20);
    expect(getByRole('button', { name: 'Resend link' })).toBeEnabled();
  });

  it('resends, toasts "New link sent" and restarts the cooldown', async () => {
    const { getByRole, onResend } = setup();
    await tick(30);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Resend link' }));
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(document.body).toHaveTextContent('New link sent');
    expect(getByRole('button', { name: 'Resend in 0:30' })).toBeDisabled();
    // Confirmation toasts stay up 4s (UX rules: feedback-and-states § 9).
    await tick(3);
    expect(document.body).toHaveTextContent('New link sent');
    await tick(2);
    expect(document.body).not.toHaveTextContent('New link sent');
  });

  it('shows the rate-limit banner and waits 60 s when the resend is throttled', async () => {
    const { getByRole } = setup('rate_limited');
    await tick(30);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Resend link' }));
    });
    expect(getByRole('alert')).toHaveTextContent('Too many tries. Wait 60 s.');
    expect(getByRole('button', { name: 'Resend in 0:60' })).toBeDisabled();
  });

  it('shows a generic error and keeps Resend usable when the send fails', async () => {
    const { getByRole } = setup('error');
    await tick(30);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Resend link' }));
    });
    expect(getByRole('alert')).toHaveTextContent("couldn't send the link");
    expect(getByRole('button', { name: 'Resend link' })).toBeEnabled();
  });

  it('returns to the start form via "Use a different email"', () => {
    const { getByRole, onChangeEmail } = setup();
    fireEvent.click(getByRole('button', { name: 'Use a different email' }));
    expect(onChangeEmail).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    vi.useRealTimers();
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
