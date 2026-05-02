import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID } from '../../test/signingApiMock';
import { writeDoneSnapshot } from '../../features/signing';
import { SigningDonePage } from './SigningDonePage';

function renderDone() {
  return renderSigningRoute(<SigningDonePage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/done`,
    path: '/sign/:envelopeId/done',
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
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
    expect(screen.getByRole('heading', { name: /seald\./i })).toBeInTheDocument();
    expect(screen.getByText(/maya@example\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/eliran azulay/i)).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
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
      await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
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
      await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
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
      await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
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
      await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
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
      await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      // Now type a valid email and submit again — should navigate and
      // the alert must be gone.
      await userEvent.type(input, 'maya@example.com');
      await userEvent.click(screen.getByRole('button', { name: /save my copy/i }));
      await waitFor(() => {
        expect(screen.getByTestId('__pathname__').textContent).toBe('/signup');
      });
    });
  });
});
