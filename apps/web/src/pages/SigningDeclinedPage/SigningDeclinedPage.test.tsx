import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID } from '../../test/signingApiMock';
import { writeDoneSnapshot } from '../../features/signing';
import { SigningDeclinedPage } from './SigningDeclinedPage';

function renderDeclined() {
  return renderSigningRoute(<SigningDeclinedPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/declined`,
    path: '/sign/:envelopeId/declined',
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('SigningDeclinedPage', () => {
  it('renders sender in the body when snapshot has sender_name', () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000001',
      title: 'MSA',
      sender_name: 'Eliran',
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDeclined();
    expect(screen.getByRole('heading', { name: 'Declined' })).toBeInTheDocument();
    expect(screen.getByText('Eliran was notified.')).toBeInTheDocument();
  });

  it('falls back to generic text when sender_name is null', () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000002',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDeclined();
    expect(screen.getByText('The sender was notified.')).toBeInTheDocument();
  });

  it('redirects to /sign/:id when no snapshot exists', async () => {
    renderDeclined();
    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('redirects when the snapshot is of kind=submitted (wrong page)', async () => {
    writeDoneSnapshot({
      kind: 'submitted',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTSUB000001',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDeclined();
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  // Item 23 — consent-withdrawn snapshots render distinct copy from a
  // plain decline. The "You declined this request." line is wrong for
  // a user who chose ESIGN §7001(c)(1) consent withdrawal.
  it('renders the consent-withdrawn copy when decline_reason="consent-withdrawn"', () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000003',
      title: 'MSA',
      sender_name: 'Eliran',
      recipient_email: 'maya@example.com',
      timestamp: '',
      decline_reason: 'consent-withdrawn',
    });
    renderDeclined();
    expect(
      screen.getByRole('heading', {
        name: /you withdrew consent to sign electronically/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/recorded the withdrawal in the audit trail/i)).toBeInTheDocument();
    // The plain "Declined" heading must NOT show.
    expect(screen.queryByRole('heading', { name: 'Declined' })).toBeNull();
  });

  it('quotes what the signer told the sender', () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000004',
      title: 'MSA',
      sender_name: 'Eliran',
      recipient_email: 'maya@example.com',
      timestamp: '',
      decline_reason: 'declined',
      reason_text: 'Terms: clause 4',
    });
    renderDeclined();
    expect(screen.getByText('Terms: clause 4')).toBeInTheDocument();
  });

  it('names the wrong-recipient hand-off', () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000005',
      title: 'MSA',
      sender_name: 'Eliran',
      recipient_email: 'maya@example.com',
      timestamp: '',
      decline_reason: 'not-the-recipient',
    });
    renderDeclined();
    expect(screen.getByRole('heading', { name: 'Wrong recipient' })).toBeInTheDocument();
    expect(screen.getByText(/send a fresh link to the right person/i)).toBeInTheDocument();
  });

  it('Close leaves the signing flow', async () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000006',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDeclined();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe('/');
    });
  });
});
