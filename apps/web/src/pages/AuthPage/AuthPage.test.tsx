import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { takeRememberedNext } from '@/layout/nextPath';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { AuthPage } from './AuthPage';

function renderAt(entry: string, auth: Partial<AuthContextValue> = {}) {
  const signInWithEmailLink = vi.fn(async (_email: string) => undefined);
  const signInWithGoogle = vi.fn(async () => undefined);
  const enterGuestMode = vi.fn(async () => undefined);
  const utils = renderWithProviders(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/signin" element={<AuthPage />} />
        <Route path="/signup" element={<AuthPage />} />
        <Route path="/document/new" element={<h1>Upload page</h1>} />
      </Routes>
    </MemoryRouter>,
    { auth: { signInWithEmailLink, signInWithGoogle, enterGuestMode, ...auth } },
  );
  return { ...utils, signInWithEmailLink, signInWithGoogle, enterGuestMode };
}

const emailBox = () => screen.getByRole('textbox', { name: 'Email' });
const sendButton = (name = 'Email me a sign-in link') => screen.getByRole('button', { name });

describe('AuthPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is one combined screen on /signin and on /signup', () => {
    renderAt('/signin');
    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('renders the same screen on /signup', () => {
    renderAt('/signup');
    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
  });

  it('sends a magic link and swaps the form for the check-email panel', async () => {
    const user = userEvent.setup();
    const { signInWithEmailLink } = renderAt('/signin');
    await user.type(emailBox(), 'hannah@quill.vc');
    await user.click(sendButton());
    expect(signInWithEmailLink).toHaveBeenCalledWith('hannah@quill.vc');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /sign-in link sent/i })).toHaveTextContent(
      'hannah@quill.vc',
    );
  });

  it('rejects a malformed email without sending anything', async () => {
    const user = userEvent.setup();
    const { signInWithEmailLink } = renderAt('/signin');
    await user.type(emailBox(), 'hannah@quill');
    await user.click(sendButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Check the email address');
    expect(signInWithEmailLink).not.toHaveBeenCalled();
  });

  it('shows the generic error banner and stays editable when the send fails', async () => {
    const user = userEvent.setup();
    renderAt('/signin', {
      signInWithEmailLink: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    });
    await user.type(emailBox(), 'hannah@quill.vc');
    await user.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't send the link");
    expect(sendButton()).toBeEnabled();
    expect(emailBox()).toHaveValue('hannah@quill.vc');
  });

  it('locks the button on HTTP 429 for 60 s', async () => {
    renderAt('/signin?email=hannah%40quill.vc', {
      signInWithEmailLink: vi.fn(async () => {
        throw Object.assign(new Error('rate'), { status: 429 });
      }),
    });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many tries. Wait 60 s.');
    expect(sendButton()).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(sendButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pre-fills ?email= and shows the save-your-document banner', () => {
    renderAt('/signup?email=hannah%40quill.vc');
    expect(emailBox()).toHaveValue('hannah@quill.vc');
    expect(screen.getByRole('status')).toHaveTextContent('Save your signed document');
  });

  it('shows the expired-link banner and a "new link" button, cleared once a new link is sent', async () => {
    const user = userEvent.setup();
    renderAt('/signin?error=link_expired&email=hannah%40quill.vc');
    expect(screen.getByRole('alert')).toHaveTextContent('That sign-in link expired');
    await user.click(sendButton('Email me a new link'));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });

  it.each(['oauth', 'oauth_timeout'])('shows the Google banner for ?error=%s', (key) => {
    renderAt(`/signin?error=${key}`);
    expect(screen.getByRole('alert')).toHaveTextContent("Google sign-in didn't finish");
  });

  it('starts Google sign-in and reports a start failure', async () => {
    const user = userEvent.setup();
    renderAt('/signin', {
      signInWithGoogle: vi.fn(async () => {
        throw new Error('popup blocked');
      }),
    });
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Google sign-in didn't finish");
  });

  it('calls signInWithGoogle on click', async () => {
    const user = userEvent.setup();
    const { signInWithGoogle } = renderAt('/signin');
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('enters guest mode and goes to the upload page', async () => {
    const user = userEvent.setup();
    const { enterGuestMode } = renderAt('/signin');
    await user.click(screen.getByRole('button', { name: 'Try without an account' }));
    expect(enterGuestMode).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Upload page' })).toBeInTheDocument();
  });

  it('shows an error banner when the guest session cannot start', async () => {
    const user = userEvent.setup();
    renderAt('/signin', {
      enterGuestMode: vi.fn(async () => {
        throw new Error('anonymous sign-ins disabled');
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Try without an account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't start a guest session");
  });

  it('parks a valid ?next= for the round trip through /auth/callback', () => {
    renderAt('/signin?next=%2Fapprove%2Fabc%2Freview%3Fpage%3D1');
    expect(takeRememberedNext()).toBe('/approve/abc/review?page=1');
  });

  it('ignores an unsafe ?next=', () => {
    renderAt('/signin?next=https%3A%2F%2Fevil.com');
    expect(takeRememberedNext()).toBeNull();
  });

  it('"Use a different email" returns to an empty form', async () => {
    const user = userEvent.setup();
    renderAt('/signin');
    await user.type(emailBox(), 'hannah@quill.vc');
    await user.click(sendButton());
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(emailBox()).toHaveValue('');
  });
});
