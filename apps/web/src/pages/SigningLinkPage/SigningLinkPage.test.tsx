import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID, createSigningApiMock } from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());
vi.mock('../../lib/api/verifyApiClient', () => ({
  verifyApiClient: { get: vi.fn() },
}));

import { signApiClient } from '../../lib/api/signApiClient';
import { verifyApiClient } from '../../lib/api/verifyApiClient';
import { stashLinkHints } from '../../features/signing';
import type { LinkHints } from '../../features/signing';
import { SigningLinkPage } from './SigningLinkPage';

const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;
const verifyGet = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;

function renderLink(state: string, hints?: LinkHints) {
  if (hints) stashLinkHints(MOCK_ENVELOPE_ID, hints);
  return renderSigningRoute(<SigningLinkPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/link/${state}`,
    path: '/sign/:envelopeId/link/:state',
  });
}

function pathname(): string {
  // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
  return screen.getByTestId('__pathname__').textContent ?? '';
}

beforeEach(() => {
  window.sessionStorage.clear();
  post.mockReset();
  post.mockResolvedValue({ data: { status: 'requested' }, status: 202 });
  verifyGet.mockReset();
});

describe('SigningLinkPage', () => {
  it('Already signed: says when, and offers the sealed copy once it exists', async () => {
    verifyGet.mockResolvedValue({
      data: {
        envelope: { status: 'completed', title: 'MSA' },
        sealed_url: 'https://signed.example/sealed.pdf',
      },
    });
    renderLink('signed', { signed_at: '2026-10-21T10:00:00.000Z', short_code: 'ABC123' });
    expect(screen.getByRole('heading', { name: 'Already signed' })).toBeInTheDocument();
    expect(screen.getByText('You signed on Oct 21.')).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Download' });
    expect(link).toHaveAttribute('href', 'https://signed.example/sealed.pdf');
  });

  it('Already signed: the download waits for the others when there is no seal yet', async () => {
    verifyGet.mockResolvedValue({
      data: { envelope: { status: 'sealing', title: 'MSA' }, sealed_url: null },
    });
    renderLink('signed', { short_code: 'ABC123' });
    expect(await screen.findByRole('button', { name: 'Download (after all sign)' })).toBeDisabled();
    expect(screen.getByText('You already signed this document.')).toBeInTheDocument();
  });

  it('Link expired: Ask for a new link posts the token and turns into a disabled Requested', async () => {
    renderLink('expired', { token: 'tok'.repeat(15), sender_name: 'Eliran Azulay' });
    expect(screen.getByRole('heading', { name: 'Link expired' })).toBeInTheDocument();
    // The page says what the button does before the signer presses it.
    expect(
      screen.getByText('Ask Eliran Azulay for a new one. It arrives by email.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask for a new link' }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/request-link',
        { envelope_id: MOCK_ENVELOPE_ID, token: 'tok'.repeat(15) },
        expect.any(Object),
      );
    });
    expect(await screen.findByRole('button', { name: 'Requested' })).toBeDisabled();
    expect(screen.getByText('Eliran Azulay will send a new link.')).toBeInTheDocument();
  });

  it('Link expired: says so when the request fails, and lets the signer try again', async () => {
    post.mockRejectedValueOnce(new Error('boom'));
    renderLink('expired', { token: 'tok'.repeat(15) });
    await userEvent.click(screen.getByRole('button', { name: 'Ask for a new link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send your request/i);
    expect(screen.getByRole('button', { name: 'Ask for a new link' })).toBeEnabled();
  });

  it('Link expired: with no token to ask with, points to the sender', () => {
    renderLink('expired');
    expect(screen.queryByRole('button', { name: 'Ask for a new link' })).toBeNull();
    expect(screen.getByText('Ask the sender to send you a new link.')).toBeInTheDocument();
  });

  it('Request withdrawn: names the sender and asks for nothing', () => {
    renderLink('withdrawn', { sender_name: 'Eliran Azulay' });
    expect(screen.getByRole('heading', { name: 'Request withdrawn' })).toBeInTheDocument();
    expect(screen.getByText('Eliran Azulay withdrew this request. Nothing to do.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Not your turn: shows who signs first and offers to check again', () => {
    renderLink('notyet', { waiting_on: 'Alex', sender_name: 'Eliran Azulay' });
    expect(screen.getByRole('heading', { name: 'Not your turn yet' })).toBeInTheDocument();
    expect(screen.getByText('Alex signs first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('Declined: a plain statement', () => {
    renderLink('declined');
    expect(screen.getByRole('heading', { name: 'You declined this request' })).toBeInTheDocument();
  });

  it('Link not valid: Try again re-opens the original link when the token is known', async () => {
    renderLink('invalid', { token: 'tok'.repeat(15), sender_name: 'Eliran Azulay' });
    expect(screen.getByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
    expect(screen.getByText('Open the latest email from Eliran Azulay.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('an unknown state falls back to the invalid screen', async () => {
    renderLink('nonsense');
    expect(await screen.findByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
  });
});
