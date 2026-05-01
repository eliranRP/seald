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

// Stub pdfjs-dist so DocumentPageCanvas doesn't try to hit /sign/pdf in jsdom.
// The placeholder branch is still exercised; we only need to prevent the
// `getDocument` call chain from crashing under jsdom.
vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({ promise: Promise.reject(new Error('jsdom-stub')) }),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

// eslint-disable-next-line import/first
import { signApiClient } from '../../lib/api/signApiClient';
// eslint-disable-next-line import/first
import { SigningFillPage } from './SigningFillPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

function okResponse<T>(data: T, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} };
}

function renderFill() {
  return renderSigningRoute(<SigningFillPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
    path: '/sign/:envelopeId/fill',
  });
}

// jsdom stub for canvas toBlob used by SignatureCapture.
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue(okResponse(makeSignMeResponse()));
  HTMLCanvasElement.prototype.toBlob = function toBlobStub(cb: BlobCallback) {
    cb(new Blob(['fake'], { type: 'image/png' }));
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SigningFillPage', () => {
  it('renders the header with progress 0 of 2', async () => {
    renderFill();
    expect(
      await screen.findByRole('progressbar', { name: /0 of 2 fields complete/i }),
    ).toBeInTheDocument();
  });

  it('clicking a text field opens the drawer, Apply persists the value', async () => {
    post.mockResolvedValueOnce(
      okResponse({
        id: 'f-text',
        signer_id: 'signer-test-001',
        kind: 'text',
        page: 1,
        x: 60,
        y: 300,
        required: true,
        value_text: 'Engineer',
        filled_at: '2026-04-24T00:00:00Z',
      }),
    );
    renderFill();

    const textField = await screen.findByRole('button', { name: /text \(required\)/i });
    await userEvent.click(textField);

    const input = await screen.findByRole('textbox', { name: /text/i });
    await userEvent.type(input, 'Engineer');
    // Two "Apply" buttons appear (one per open drawer). Find within the dialog.
    const dialog = screen.getByRole('dialog', { name: /^text$/i });
    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    );
    expect(apply).toBeDefined();
    await userEvent.click(apply!);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-text',
        { value_text: 'Engineer' },
        expect.any(Object),
      );
    });
  });

  it('clicking a signature field opens SignatureCapture; Apply posts multipart', async () => {
    post.mockResolvedValueOnce(okResponse(makeSignMeResponse().signer));
    renderFill();

    const sigField = await screen.findByRole('button', { name: /sign here \(required\)/i });
    await userEvent.click(sigField);

    // Signature sheet mounts with the "type" tab selected + a defaultName
    // pre-filled → Apply is enabled immediately.
    const dialog = await screen.findByRole('dialog', { name: /signature/i });
    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    );
    expect(apply).toBeDefined();
    await userEvent.click(apply!);

    await waitFor(() => {
      const sigCalls = post.mock.calls.filter((c) => c[0] === '/sign/signature');
      expect(sigCalls).toHaveLength(1);
      const body = sigCalls[0]![1] as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('format')).toBe('typed');
      expect(body.get('image')).toBeInstanceOf(Blob);
    });
  });

  it('a 401 mid-flow redirects the user back to /sign/:id', async () => {
    const err = Object.assign(new Error('session_expired'), { status: 401 });
    post.mockRejectedValueOnce(err);

    renderFill();
    const textField = await screen.findByRole('button', { name: /text \(required\)/i });
    await userEvent.click(textField);
    const input = await screen.findByRole('textbox', { name: /text/i });
    await userEvent.type(input, 'hi');
    const dialog = screen.getByRole('dialog', { name: /^text$/i });
    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    );
    await userEvent.click(apply!);

    await waitFor(() => {
      // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
      expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  describe('Withdraw consent (issue #41)', () => {
    afterEach(() => {
      vi.spyOn(window, 'confirm').mockRestore?.();
    });

    it('renders a Withdraw consent control next to Decline on the signing screen', async () => {
      renderFill();
      const btn = await screen.findByRole('button', { name: /withdraw consent/i });
      expect(btn).toBeInTheDocument();
    });

    it('confirm + click POSTs /sign/withdraw-consent and routes to /declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      post.mockResolvedValueOnce(
        okResponse({ status: 'consent_withdrawn', envelope_status: 'declined' }),
      );
      renderFill();
      const btn = await screen.findByRole('button', { name: /withdraw consent/i });
      await userEvent.click(btn);
      await waitFor(() => {
        expect(post).toHaveBeenCalledWith('/sign/withdraw-consent', undefined, expect.any(Object));
      });
      await waitFor(() => {
        // no semantic role: __pathname__ is a test-only sentinel probe (rule 4.6)
        expect(screen.getByTestId('__pathname__').textContent).toBe(
          `/sign/${MOCK_ENVELOPE_ID}/declined`,
        );
      });
    });

    it('cancelled confirm does not call the withdraw endpoint', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderFill();
      const btn = await screen.findByRole('button', { name: /withdraw consent/i });
      await userEvent.click(btn);
      // No POSTs at all — only the GET /sign/me from the initial render fired.
      expect(post).not.toHaveBeenCalled();
    });
  });

  it('a 413 signature upload surfaces a size-error banner (no redirect)', async () => {
    const err = Object.assign(new Error('image_too_large'), { status: 413 });
    post.mockRejectedValueOnce(err);

    renderFill();
    const sigField = await screen.findByRole('button', { name: /sign here \(required\)/i });
    await userEvent.click(sigField);
    const dialog = await screen.findByRole('dialog', { name: /signature/i });
    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    );
    await userEvent.click(apply!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
  });
});
