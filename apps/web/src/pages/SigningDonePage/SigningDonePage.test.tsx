import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID } from '../../test/signingApiMock';
import { writeDoneSnapshot } from '../../features/signing';
import type { DoneSnapshot } from '../../features/signing';
import { SigningDonePage } from './SigningDonePage';

vi.mock('../../lib/api/verifyApiClient', () => ({
  verifyApiClient: { get: vi.fn() },
}));

import { verifyApiClient } from '../../lib/api/verifyApiClient';

const verifyGet = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;

const COMPLETED_PAYLOAD = {
  envelope: {
    id: MOCK_ENVELOPE_ID,
    title: 'Master Services Agreement',
    short_code: 'TESTDONE00001',
    status: 'completed' as const,
    original_pages: 2,
    original_sha256: null,
    sealed_sha256: null,
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-25T21:20:50Z',
    completed_at: '2026-04-25T21:21:08Z',
    expires_at: '2026-05-25T21:20:50Z',
  },
  signers: [],
  events: [],
  chain_intact: true,
  sealed_url: 'https://signed.example/sealed.pdf?sig=stub',
  audit_url: 'https://signed.example/audit.pdf?sig=stub',
};

const SEALING_PAYLOAD = {
  ...COMPLETED_PAYLOAD,
  envelope: { ...COMPLETED_PAYLOAD.envelope, status: 'sealing' as const, completed_at: null },
  sealed_url: null,
  audit_url: null,
};

function seed(overrides: Partial<DoneSnapshot> = {}): void {
  writeDoneSnapshot({
    kind: 'submitted',
    envelope_id: MOCK_ENVELOPE_ID,
    short_code: 'TESTDONE00099',
    title: 'Master Services Agreement',
    sender_name: 'Eliran Azulay',
    recipient_email: 'maya@example.com',
    timestamp: '2026-04-25T21:21:08Z',
    ...overrides,
  });
}

function renderDone() {
  return renderSigningRoute(<SigningDonePage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/done`,
    path: '/sign/:envelopeId/done',
  });
}

function pathname(): string {
  // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
  return screen.getByTestId('__pathname__').textContent ?? '';
}

beforeEach(() => {
  window.sessionStorage.clear();
  verifyGet.mockReset();
  verifyGet.mockResolvedValue({ data: COMPLETED_PAYLOAD });
});

describe('SigningDonePage', () => {
  it('says Signed, who gets it, and how many others still have to sign', () => {
    seed({ signed_count: 2, total_count: 3 });
    renderDone();
    expect(screen.getByRole('heading', { name: 'Signed' })).toBeInTheDocument();
    expect(
      screen.getByText('Eliran Azulay gets it now. 1 other person still needs to sign.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 of 3 signed')).toBeInTheDocument();
  });

  it('works without a sender name or counts', () => {
    seed({ sender_name: null });
    renderDone();
    expect(screen.getByText('The sender gets it now.')).toBeInTheDocument();
    expect(screen.queryByText(/of \d+ signed/)).toBeNull();
  });

  it('keeps Download disabled with a note while others still have to sign', () => {
    seed({ signed_count: 1, total_count: 3 });
    verifyGet.mockResolvedValue({ data: SEALING_PAYLOAD });
    renderDone();
    const button = screen.getByRole('button', { name: 'Download (after all sign)' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('shows the way to a free account with the email prefilled', () => {
    seed();
    renderDone();
    expect(
      screen.getByRole('link', { name: 'Save a copy to a free Seald account' }),
    ).toHaveAttribute('href', '/signup?email=maya%40example.com');
  });

  it('keeps the retention and signature-level notes', () => {
    seed();
    renderDone();
    expect(screen.getByRole('link', { name: '/verify/TESTDONE00099' })).toBeInTheDocument();
  });

  it('redirects to /sign/:id when no snapshot exists', async () => {
    renderDone();
    await waitFor(() => {
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('redirects when the snapshot envelope_id does not match', async () => {
    seed({ envelope_id: 'some-other-envelope' });
    renderDone();
    await waitFor(() => {
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  describe('Download signed PDF', () => {
    // The recipient lands here right after submitting; the seal worker is
    // async, so we may arrive while the envelope is still `sealing`. The
    // public verify endpoint is the only surface after /sign/submit clears
    // the signer cookie.

    it('renders an enabled Download link with a slugified filename once sealed', async () => {
      seed({ signed_count: 3, total_count: 3 });
      renderDone();

      const link = await screen.findByRole('link', { name: 'Download' });
      expect(link).toHaveAttribute('href', COMPLETED_PAYLOAD.sealed_url);
      expect(link).toHaveAttribute('download', 'Master-Services-Agreement-signed.pdf');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('queries the public /verify endpoint (cookie-less) keyed by the snapshot short_code', async () => {
      seed();
      renderDone();

      await screen.findByRole('link', { name: 'Download' });
      expect(verifyGet).toHaveBeenCalledWith(
        '/verify/TESTDONE00099',
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    it('shows a disabled "Preparing" button with a hint while the seal is being made', async () => {
      seed({ signed_count: 3, total_count: 3 });
      verifyGet.mockResolvedValue({ data: SEALING_PAYLOAD });
      renderDone();

      const button = await screen.findByRole('button', { name: /preparing the signed pdf/i });
      expect(button).toBeDisabled();
      expect(screen.getByText(/finalizing the seal/i)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
    });

    it('flips from disabled to an enabled link when the seal completes on a later poll', async () => {
      seed({ signed_count: 3, total_count: 3 });
      verifyGet
        .mockResolvedValueOnce({ data: SEALING_PAYLOAD })
        .mockResolvedValue({ data: COMPLETED_PAYLOAD });
      renderDone();

      await screen.findByRole('button', { name: /preparing the signed pdf/i });
      const link = await screen.findByRole('link', { name: 'Download' }, { timeout: 5_000 });
      expect(link).toHaveAttribute('href', COMPLETED_PAYLOAD.sealed_url);
    });

    it('surfaces an inline alert when the verify request errors and no sealed copy is available', async () => {
      seed({ signed_count: 3, total_count: 3 });
      verifyGet.mockRejectedValue(new Error('network'));
      renderDone();

      const alert = await screen.findByRole('alert', undefined, { timeout: 5_000 });
      expect(alert).toHaveTextContent(/we couldn.?t load the download yet/i);
      expect(screen.getByRole('button', { name: /download|preparing/i })).toBeDisabled();
    });
  });
});
