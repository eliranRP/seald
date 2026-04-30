import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// eslint-disable-next-line import/first
import { signApiClient } from '../../lib/api/signApiClient';
// eslint-disable-next-line import/first
import { SigningPrepPage } from './SigningPrepPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

function renderPrep() {
  return renderSigningRoute(<SigningPrepPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/prep`,
    path: '/sign/:envelopeId/prep',
  });
}

function okResponse<T>(data: T, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  // Default: happy path — /sign/me resolves with a fresh signer.
  get.mockResolvedValue(okResponse(makeSignMeResponse()));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(window, 'confirm').mockRestore?.();
});

describe('SigningPrepPage', () => {
  it('renders signer identity card with name + email', async () => {
    renderPrep();
    expect(await screen.findByText('Maya Raskin')).toBeInTheDocument();
    expect(screen.getByText('maya@example.com')).toBeInTheDocument();
  });

  it('links the Consumer Disclosure copy to /legal/esign-disclosure', async () => {
    renderPrep();
    const link = await screen.findByRole('link', { name: /consumer disclosure/i });
    expect(link).toHaveAttribute('href', '/legal/esign-disclosure');
  });

  it('Start signing is disabled until BOTH ESIGN checkboxes are ticked', async () => {
    renderPrep();
    const start = await screen.findByRole('button', { name: /start signing/i });
    expect(start).toBeDisabled();
    const consent = screen.getByRole('checkbox', { name: /read the consumer disclosure/i });
    await userEvent.click(consent);
    // Only one of two checked — still disabled (T-14 requires both).
    expect(start).toBeDisabled();
    const access = screen.getByRole('checkbox', {
      name: /access electronic records on this device/i,
    });
    await userEvent.click(access);
    expect(start).not.toBeDisabled();
  });

  it('clicking Start calls acceptTerms + esign-disclosure and navigates to /fill', async () => {
    // Two POSTs expected: /sign/accept-terms and /sign/esign-disclosure.
    post.mockResolvedValue(okResponse(null, 204));
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/accept-terms', undefined, expect.any(Object));
    });
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/esign-disclosure',
        { disclosure_version: 'esign_v0.1' },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
  });

  it('skips acceptTerms when tc_accepted_at is already set, but still records esign-disclosure', async () => {
    get.mockResolvedValueOnce(
      okResponse(
        makeSignMeResponse({
          signer: {
            ...makeSignMeResponse().signer,
            tc_accepted_at: '2026-04-24T00:00:00Z',
          },
        }),
      ),
    );
    post.mockResolvedValue(okResponse(null, 204));
    renderPrep();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /read the consumer disclosure/i }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /access electronic records on this device/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /start signing/i }));
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/fill`);
    });
    // acceptTerms was skipped; esign-disclosure was still POSTed (T-14).
    expect(post).not.toHaveBeenCalledWith(
      '/sign/accept-terms',
      expect.anything(),
      expect.anything(),
    );
    expect(post).toHaveBeenCalledWith(
      '/sign/esign-disclosure',
      { disclosure_version: 'esign_v0.1' },
      expect.any(Object),
    );
  });

  it('confirm+decline navigates to /declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockResolvedValueOnce(okResponse({ status: 'declined', envelope_status: 'declined' }));
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /decline this request/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/decline',
        { reason: 'declined-on-prep' },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('__pathname__').textContent).toBe(
        `/sign/${MOCK_ENVELOPE_ID}/declined`,
      );
    });
  });

  it('cancelled confirm does not call decline', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPrep();
    await userEvent.click(await screen.findByRole('button', { name: /decline this request/i }));
    expect(post).not.toHaveBeenCalled();
  });
});
