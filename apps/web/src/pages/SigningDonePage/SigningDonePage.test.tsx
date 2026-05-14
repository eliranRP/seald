import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID } from '../../test/signingApiMock';
import { writeDoneSnapshot } from '../../features/signing';
import { SigningDonePage } from './SigningDonePage';

vi.mock('../../lib/api/verifyApiClient', () => ({
  verifyApiClient: { get: vi.fn() },
}));

// eslint-disable-next-line import/first, import/order
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

function renderDone() {
  return renderSigningRoute(<SigningDonePage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/done`,
    path: '/sign/:envelopeId/done',
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  verifyGet.mockReset();
  // Default: pretend no snapshot has been seeded yet — tests that
  // exercise the verify path explicitly seed the snapshot AND wire up
  // a verify response.
  verifyGet.mockResolvedValue({ data: COMPLETED_PAYLOAD });
});

describe('SigningDonePage', () => {
  it('renders snapshot email + sender when a submitted snapshot exists', () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDONE00001',
      title: 'Master Services Agreement',
      sender_name: 'Eliran Azulay',
      recipient_email: 'maya@example.com',
      timestamp: '2026-04-24T00:00:00Z',
    });
    renderDone();
    // Item 17 — hero copy is now verb-led ("Signed and sealed.") instead
    // of the unhelpful brand-name-only "Seald.".
    expect(screen.getByRole('heading', { name: /signed and sealed/i })).toBeInTheDocument();
    expect(screen.getByText(/maya@example\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/eliran azulay/i)).toBeInTheDocument();
  });

  // Item 18 — the upsell email input must visibly carry the snapshot's
  // recipient_email so signers see whose account they're creating.
  it('Upsell email input is prefilled from snap.recipient_email', () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDONE00100',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'prefill@example.com',
      timestamp: '',
    });
    renderDone();
    const input = screen.getByLabelText(/your email/i) as HTMLInputElement;
    expect(input.value).toBe('prefill@example.com');
  });

  // Item 18 — CTA copy updated to make the upsell unambiguous: this is
  // signup, not "send another copy to this address".
  it('Upsell CTA copy is "Save to my Seald account" (not "Save my copy")', () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDONE00101',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDone();
    expect(screen.getByRole('button', { name: /save to my seald account/i })).toBeInTheDocument();
  });

  // Item 19 — disabled "Preparing signed PDF…" button shows a Spinner
  // alongside the Download icon so the loading state is unambiguous.
  it('Disabled "Preparing signed PDF…" button mounts a Spinner element', async () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDONE00102',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    verifyGet.mockResolvedValue({ data: SEALING_PAYLOAD });
    renderDone();
    const button = await screen.findByRole('button', { name: /preparing signed pdf/i });
    // The Spinner styled-component sets `data-testid="signing-spinner"`
    // so we have an unambiguous handle without depending on visual rules.
    expect(button.querySelector('[data-testid="signing-spinner"]')).not.toBeNull();
  });

  it('redirects to /sign/:id when no snapshot exists', async () => {
    renderDone();
    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('redirects when the snapshot envelope_id does not match', async () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: 'some-other-envelope',
      short_code: 'TESTDONE00002',
      title: 'Other',
      sender_name: null,
      recipient_email: 'x@y',
      timestamp: '',
    });
    renderDone();
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('Save-my-copy navigates to /signup with email prefilled', async () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDONE00003',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDone();
    await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe('/signup');
    });
  });

  describe('Save-my-copy — input validation (regression)', () => {
    // Original bug: submitting an empty / whitespace-only / garbage-shaped
    // email silently returned (no navigation, no error). The signer saw
    // nothing happen when they clicked the button. Now the page surfaces
    // an inline alert and stays on /done so the user knows what to fix.

    it('does not navigate and shows an inline error when the email is empty', async () => {
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: MOCK_ENVELOPE_ID,
        short_code: 'TESTDONE00010',
        title: 'MSA',
        sender_name: null,
        recipient_email: 'maya@example.com',
        timestamp: '',
      });
      renderDone();
      const input = screen.getByLabelText(/your email/i);
      // Clear the prefilled email so submission is the empty-input repro.
      await userEvent.clear(input);
      expect((input as HTMLInputElement).value).toBe('');
      await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
      // The page must stay on /done — no redirect to /signup. The probe
      // only mounts under the `*` fallback route, so its absence is the
      // signal that we're still on the real /done route.
      expect(screen.queryByTestId('__pathname__')).toBeNull();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/enter an email/i);
    });

    it('does not navigate and shows an inline error for whitespace-only input', async () => {
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: MOCK_ENVELOPE_ID,
        short_code: 'TESTDONE00011',
        title: 'MSA',
        sender_name: null,
        recipient_email: 'maya@example.com',
        timestamp: '',
      });
      renderDone();
      const input = screen.getByLabelText(/your email/i);
      await userEvent.clear(input);
      await userEvent.type(input, '   ');
      await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
      expect(screen.queryByTestId('__pathname__')).toBeNull();
      expect(await screen.findByRole('alert')).toHaveTextContent(/enter an email/i);
    });

    it('does not navigate and shows an inline error for clearly-invalid email shape', async () => {
      // The original code passed any non-empty trimmed string straight
      // through `encodeURIComponent` into `/signup?email=…`. A signer
      // typing "hello" then clicking Save my copy ended up on a signup
      // page with `email=hello`, which then errored at the form layer.
      // Catch the bad shape on the Done page so the failure point is
      // local to the field they typed in.
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: MOCK_ENVELOPE_ID,
        short_code: 'TESTDONE00012',
        title: 'MSA',
        sender_name: null,
        recipient_email: 'maya@example.com',
        timestamp: '',
      });
      renderDone();
      const input = screen.getByLabelText(/your email/i);
      await userEvent.clear(input);
      await userEvent.type(input, 'not an email');
      await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
      expect(screen.queryByTestId('__pathname__')).toBeNull();
      expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    });

    it('navigates to /signup and trims surrounding whitespace from the email', async () => {
      // Pasted addresses sometimes carry leading/trailing whitespace from
      // the clipboard. Trim before encoding so the downstream signup
      // page sees the canonical address.
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: MOCK_ENVELOPE_ID,
        short_code: 'TESTDONE00013',
        title: 'MSA',
        sender_name: null,
        recipient_email: 'maya@example.com',
        timestamp: '',
      });
      renderDone();
      const input = screen.getByLabelText(/your email/i);
      await userEvent.clear(input);
      await userEvent.type(input, '  maya@example.com  ');
      await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
      await waitFor(() => {
        expect(screen.getByTestId('__pathname__').textContent).toBe('/signup');
      });
    });

    it('clears a previously-shown error once the user submits a valid email', async () => {
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: MOCK_ENVELOPE_ID,
        short_code: 'TESTDONE00014',
        title: 'MSA',
        sender_name: null,
        recipient_email: 'maya@example.com',
        timestamp: '',
      });
      renderDone();
      const input = screen.getByLabelText(/your email/i);
      await userEvent.clear(input);
      // First submission is empty → alert shown.
      await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      // Now type a valid email and submit again — should navigate and
      // the alert must be gone.
      await userEvent.type(input, 'maya@example.com');
      await userEvent.click(screen.getByRole('button', { name: /save to my seald account/i }));
      await waitFor(() => {
        expect(screen.getByTestId('__pathname__').textContent).toBe('/signup');
      });
    });
  });

  describe('Download signed PDF (post-sign action)', () => {
    // The recipient lands here right after submitting; the seal worker
    // is async so we may arrive while the envelope is still in
    // `sealing` state. The button must:
    //   - render disabled with "Preparing signed PDF…" while sealing
    //   - flip to an enabled link with the sealed_url + a slugified
    //     `download="…-signed.pdf"` filename once status === 'completed'
    //   - poll the public verify endpoint (the only surface available
    //     after the signer-session cookie is cleared by /sign/submit)
    //   - surface an inline alert when the public verify endpoint
    //     errors and there is still no sealed copy

    function seedSnapshot() {
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: MOCK_ENVELOPE_ID,
        short_code: 'TESTDONE00099',
        title: 'Master Services Agreement',
        sender_name: 'Eliran Azulay',
        recipient_email: 'maya@example.com',
        timestamp: '2026-04-25T21:21:08Z',
      });
    }

    it('renders an enabled "Download signed PDF" link with slugified filename when the envelope is sealed', async () => {
      seedSnapshot();
      verifyGet.mockResolvedValue({ data: COMPLETED_PAYLOAD });
      renderDone();

      const link = await screen.findByRole('link', { name: /download signed pdf/i });
      expect(link).toHaveAttribute('href', COMPLETED_PAYLOAD.sealed_url);
      expect(link).toHaveAttribute('download', 'Master-Services-Agreement-signed.pdf');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('queries the public /verify endpoint (cookie-less) keyed by the snapshot short_code', async () => {
      seedSnapshot();
      verifyGet.mockResolvedValue({ data: COMPLETED_PAYLOAD });
      renderDone();

      await screen.findByRole('link', { name: /download signed pdf/i });
      expect(verifyGet).toHaveBeenCalledWith(
        '/verify/TESTDONE00099',
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    it('renders the action disabled with a "preparing" hint while the envelope is still sealing', async () => {
      seedSnapshot();
      verifyGet.mockResolvedValue({ data: SEALING_PAYLOAD });
      renderDone();

      const button = await screen.findByRole('button', { name: /preparing signed pdf/i });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      // No download link until completion.
      expect(screen.queryByRole('link', { name: /download signed pdf/i })).toBeNull();
    });

    it('flips from disabled "preparing" to enabled link when the seal completes on a later poll', async () => {
      seedSnapshot();
      verifyGet
        .mockResolvedValueOnce({ data: SEALING_PAYLOAD })
        .mockResolvedValue({ data: COMPLETED_PAYLOAD });
      renderDone();

      // First render: disabled / preparing.
      await screen.findByRole('button', { name: /preparing signed pdf/i });
      // Eventually: enabled link (poll picks up the completed payload).
      const link = await screen.findByRole(
        'link',
        { name: /download signed pdf/i },
        {
          timeout: 5_000,
        },
      );
      expect(link).toHaveAttribute('href', COMPLETED_PAYLOAD.sealed_url);
    });

    it('surfaces an inline alert when the verify request errors and no sealed_url is available', async () => {
      seedSnapshot();
      // react-query default retries are disabled in renderSigningRoute,
      // and the hook's own retry: 1 still surfaces the failure once both
      // attempts reject. Reject every time so the test is deterministic.
      verifyGet.mockRejectedValue(new Error('network'));
      renderDone();

      const alert = await screen.findByRole('alert', undefined, { timeout: 5_000 });
      expect(alert).toHaveTextContent(/couldn.?t prepare the signed pdf/i);
      // Disabled fallback button is still present.
      expect(screen.getByRole('button', { name: /download signed pdf/i })).toBeDisabled();
    });
  });
});
