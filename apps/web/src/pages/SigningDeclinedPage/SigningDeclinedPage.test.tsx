import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByRole('heading', { name: /you declined this request/i })).toBeInTheDocument();
    expect(screen.getByText(/we've let eliran know/i)).toBeInTheDocument();
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
    expect(screen.getByText(/we've let the sender know/i)).toBeInTheDocument();
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
    // The plain "you declined this request" copy must NOT show.
    expect(screen.queryByRole('heading', { name: /you declined this request/i })).toBeNull();
  });

  // Item 24 — every declined page surfaces the finality + sender-notified
  // copy so a mis-clicker isn't left expecting a "Change my mind" path.
  it('shows "This decision is final. The sender has been notified." on every variant', () => {
    writeDoneSnapshot({
      kind: 'declined',
      envelope_id: MOCK_ENVELOPE_ID,
      short_code: 'TESTDEC000004',
      title: 'MSA',
      sender_name: null,
      recipient_email: 'maya@example.com',
      timestamp: '',
    });
    renderDeclined();
    expect(
      screen.getByText(/this decision is final\. the sender has been notified\./i),
    ).toBeInTheDocument();
  });
});
