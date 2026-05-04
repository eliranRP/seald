import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

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

function ok<T>(data: T, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} };
}

function renderFill() {
  return renderSigningRoute(<SigningFillPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
    path: '/sign/:envelopeId/fill',
  });
}

describe('SigningFillPage — Download original PDF', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    // /sign/me — primary metadata; /sign/pdf — signed URL.
    get.mockImplementation(async (url: string) => {
      if (url === '/sign/pdf') return ok({ url: 'https://signed.example/pdf?token=t' });
      return ok(makeSignMeResponse());
    });

    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    clickSpy = vi.fn();
    HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;

    HTMLCanvasElement.prototype.toBlob = function toBlobStub(cb: BlobCallback) {
      cb(new Blob(['fake'], { type: 'image/png' }));
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders an accessible Download original PDF button in the header', async () => {
    renderFill();
    const btn = await screen.findByRole('button', { name: /download original pdf/i });
    expect(btn).toBeInTheDocument();
  });

  it('clicking the button fetches the signed URL and triggers a hidden-anchor download', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['%PDF-fake'], { type: 'application/pdf' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    renderFill();
    const btn = await screen.findByRole('button', { name: /download original pdf/i });
    await userEvent.click(btn);

    // The hook calls fetch with the signed URL exposed by /sign/pdf.
    expect(fetchMock).toHaveBeenCalledWith('https://signed.example/pdf?token=t');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/\.pdf$/i);
    // Default fixture title is "Master Services Agreement".
    expect(anchor.download).toMatch(/master services agreement/i);
  });
});
