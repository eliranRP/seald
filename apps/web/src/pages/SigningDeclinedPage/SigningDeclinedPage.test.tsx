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
});
