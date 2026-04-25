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
      title: 'Master Services Agreement',
      sender_name: 'Eliran Azulay',
      recipient_email: 'maya@example.com',
      timestamp: '2026-04-24T00:00:00Z',
    });
    renderDone();
    expect(screen.getByRole('heading', { name: /sealed\./i })).toBeInTheDocument();
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
});
