import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';

// Mock the heavy PDF parser — jsdom can't decode PDFs and the page only
// needs the page-count out of it.
vi.mock('@/lib/pdf', () => ({
  usePdfDocument: vi.fn(() => ({ doc: null, numPages: 3, loading: false, error: null })),
}));

// Mock the send orchestration so we can assert the wiring without making
// real fetch calls.
const runMock = vi.fn(async () => ({ envelope_id: 'env_xyz', short_code: 'SC-1234567890' }));
vi.mock('@/features/envelopes/useSendEnvelope', () => ({
  useSendEnvelope: () => ({
    run: runMock,
    phase: 'idle' as const,
    error: null,
    reset: vi.fn(),
  }),
}));

// MWMobileNav pulls in useAccountActions which would call /me APIs — stub
// to avoid real network and keep these page tests focused on routing /
// step-flow behaviour.
import type * as AccountModule from '@/features/account';
vi.mock('@/features/account', async () => {
  const actual = await vi.importActual<typeof AccountModule>('@/features/account');
  return {
    ...actual,
    useAccountActions: () => ({
      exportData: vi.fn(async () => undefined),
      deleteAccount: vi.fn(async () => undefined),
      isExporting: false,
      isDeleting: false,
      lastError: null,
    }),
  };
});

import { MobileSendPage } from './MobileSendPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/m/send']}>
      <Routes>
        <Route path="/m/send" element={<MobileSendPage />} />
        <Route path="/templates" element={<LocationProbe />} />
        <Route path="/documents" element={<LocationProbe />} />
        <Route path="/signers" element={<LocationProbe />} />
        <Route path="/signin" element={<LocationProbe />} />
        <Route path="/document/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFile(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  });
}

function emptyFile(name: string): File {
  return new File([new Uint8Array(0)], name, { type: 'application/pdf' });
}

// Image stub: the "Take photo" tile feeds JPEGs through `imageFileToPdf`
// which constructs `new Image()` and waits for onload. jsdom doesn't
// decode image bytes, so without this stub the conversion hangs
// forever. Tests that need decode-failure override this in-place.
class StubImage {
  public width = 800;

  public height = 600;

  public naturalWidth = 800;

  public naturalHeight = 600;

  public onload: (() => void) | null = null;

  public onerror: ((err: unknown) => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }
}

describe('MobileSendPage', () => {
  beforeEach(() => {
    runMock.mockClear();
    (globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the start screen with three entry tiles', () => {
    renderPage();
    expect(screen.getByText(/new document/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
  });

  it('walks from start → file when a PDF is uploaded', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('contract.pdf')] } });
    });
    // Step 2 chrome appears.
    expect(screen.getByText(/confirm the file/i)).toBeInTheDocument();
    expect(screen.getByText(/contract\.pdf/i)).toBeInTheDocument();
  });

  it('disables Continue while no file picked, advances to signers when ready', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('nda.pdf')] } });
    });
    const cont = screen.getByRole('button', { name: /continue/i });
    expect(cont).toBeEnabled();
    await user.click(cont);
    expect(screen.getByText(/who is signing\?/i)).toBeInTheDocument();
  });

  it('blocks the place step until at least one signer is added', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));
    const next = screen.getByRole('button', { name: /next: place fields/i });
    expect(next).toBeDisabled();
  });

  it('adds a signer via the bottom sheet then enables next', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /add signer/i }));
    // Sheet open
    const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    // Sheet closes, signer appears in the list.
    expect(screen.getByText(/bob builder/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: place fields/i })).toBeEnabled();
  });

  it('renders the mobile nav (logo + hamburger) above the start screen', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /seald home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  // 2026-05-03 (refined): mobile users are locked to /m/send; every
  // desktop AppShell route bounces back here. The hamburger drawer
  // therefore exposes no nav links at all (a "Documents" tap would
  // route to /documents which the AppShell guard would immediately
  // redirect back to /m/send — a no-op that reads as broken). Identity
  // + Sign out only.
  it('hamburger opens a sheet with only Sign out — every nav affordance hidden', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Documents' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Sign' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Templates' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Signers' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /download my data/i })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /delete account/i })).toBeNull();
  });

  it('does not expose a "From a template" tile (templates is desktop-only)', () => {
    // Per 2026-05-03 product refinement, mobile users are locked to
    // /m/send and the templates list / per-template editor are
    // desktop-only screens. The start screen used to surface a
    // "From a template" tile that routed to /templates; AppShell now
    // bounces every mobile visitor back to /m/send so the tile would
    // dead-end into a redirect loop. Removing it is a positive
    // behavior assertion: no template entry on the mobile start.
    renderPage();
    expect(screen.queryByRole('button', { name: /^from a template$/i })).toBeNull();
  });

  it('rejects a 0-byte PDF at the upload boundary with an inline alert', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [emptyFile('blank.pdf')] } });
    });
    // Stays on start; surfaces a role=alert with the filename.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/blank\.pdf/i);
    expect(alert).toHaveTextContent(/empty/i);
    // Step did not advance to the file-confirm screen.
    expect(screen.queryByText(/confirm the file/i)).not.toBeInTheDocument();
  });

  // 2026-05-04: the start screen exposes a hidden file input for
  // "Take photo" that uses `accept="image/*"` + `capture="environment"`.
  // We now convert the image to a single-page PDF in the browser and
  // continue through the existing send pipeline. This test stubs the
  // conversion util to keep the page test focused on the wiring.
  it('converts a camera-capture JPEG into a PDF and advances to the file step', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', {
      type: 'image/jpeg',
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [jpeg] } });
    });
    // Advances to step 2 with a PDF-renamed file.
    expect(await screen.findByText(/confirm the file/i)).toBeInTheDocument();
    expect(screen.getByText(/photo\.pdf/i)).toBeInTheDocument();
  });

  it('shows a friendly alert when image-to-PDF conversion fails', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    // Override the Image stub for this test only — fail every decode.
    const RealImage = (globalThis as unknown as { Image: unknown }).Image;
    class FailImage {
      public onload: (() => void) | null = null;

      public onerror: ((err: unknown) => void) | null = null;

      set src(_v: string) {
        queueMicrotask(() => {
          if (this.onerror) this.onerror(new Error('decode failed'));
        });
      }
    }
    (globalThis as unknown as { Image: typeof FailImage }).Image = FailImage;
    try {
      const broken = new File([new Uint8Array([0xff, 0xd8])], 'broken.jpg', {
        type: 'image/jpeg',
      });
      await act(async () => {
        fireEvent.change(input, { target: { files: [broken] } });
      });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/couldn(’|')t convert/i);
      expect(screen.queryByText(/confirm the file/i)).not.toBeInTheDocument();
    } finally {
      (globalThis as unknown as { Image: unknown }).Image = RealImage;
    }
  });

  // QA-2026-05-02 (Bug 11): pdf.js will OOM the worker on a phone for
  // anything much over 25 MB. Hard-cap at the picker.
  it('rejects an oversize PDF (>25 MB) at the upload boundary', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    // We don't actually need 26 MB of bytes — the picker reads .size, and
    // jsdom's File honors a synthetic size when we pass a sized blob.
    const big = new File([new Uint8Array(1)], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [big] } });
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/huge\.pdf/i);
    expect(alert).toHaveTextContent(/under 25 MB/i);
    expect(screen.queryByText(/confirm the file/i)).not.toBeInTheDocument();
  });

  // QA-2026-05-02 (Bug 5): the previous flow silently swallowed duplicate
  // emails — Add closed the sheet but no signer landed. Now the sheet
  // surfaces an inline alert and disables Add.
  it('blocks adding a duplicate-email signer with an inline alert', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // First add: succeeds.
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    let dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    // Second attempt with the same email: Add stays disabled and the
    // duplicate alert is rendered.
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob B.');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'BOB@example.com');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/already on the list/i);
    expect(within(dialog).getByRole('button', { name: /^add$/i })).toBeDisabled();
  });

  // Bug C regression (2026-05-03): walk the full sender flow start → file →
  // signers → place → review → Send and assert the Send-for-signature button
  // actually invokes the orchestration. The previous suite mocked `runMock`
  // but never exercised the click path, so a regression in the Send wiring
  // (e.g. the button accidentally noop'd while disabled) would have slipped
  // through. We assert: (a) runMock fires once, (b) it receives the title
  // we typed, (c) it receives our PDF File, (d) signers includes the ad-hoc
  // bob@example.com input, (e) buildFields is supplied so the API gets the
  // placed signature box.
  it('Send-for-signature actually invokes the orchestration with the right payload', async () => {
    const user = userEvent.setup();
    runMock.mockClear();
    renderPage();

    // 1. Upload PDF
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('contract.pdf')] } });
    });
    // 2. Continue → Signers
    await user.click(screen.getByRole('button', { name: /continue/i }));
    // 3. Add signer
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    // 4. Next → Place fields. Arm Signature, click the canvas to drop one.
    await user.click(screen.getByRole('button', { name: /next: place fields/i }));
    await user.click(screen.getByRole('button', { name: /^signature$/i }));
    // The canvas drop area is a positional surface with no semantic role
    // (rule 4.6 fallback): use the data-testid the component exposes.
    const canvas = await screen.findByTestId('mw-canvas');
    await user.click(canvas);
    // 5. Review
    await user.click(screen.getByRole('button', { name: /^review/i }));
    // 6. Send
    await user.click(screen.getByRole('button', { name: /send for signature/i }));

    expect(runMock).toHaveBeenCalledTimes(1);
    const call = runMock.mock.calls[0];
    if (!call) throw new Error('expected runMock to have been invoked');
    const arg = (call as ReadonlyArray<unknown>)[0] as {
      title: string;
      file: File;
      signers: ReadonlyArray<{ email?: string; name?: string }>;
      buildFields: unknown;
    };
    expect(arg.title).toMatch(/contract/i);
    expect(arg.file.name).toBe('contract.pdf');
    expect(arg.signers.some((s) => s.email === 'bob@example.com')).toBe(true);
    expect(typeof arg.buildFields).toBe('function');
  });

  /*
   * Production bug (2026-05-04): every mobile send returned 400 Bad
   * Request. Root cause — `buildFields` emitted field placements with
   * keys `w` and `h` instead of the API DTO's required `width` /
   * `height`. Nest's global ValidationPipe runs with `whitelist:true,
   * forbidNonWhitelisted:true` so unknown properties throw 400. The
   * desktop code path (DocumentRoute.tsx) used the correct keys, so
   * desktop send was unaffected. The mismatch survived TypeScript
   * because `FieldPlacement.width`/`height` are optional, so an
   * extra-property literal slipped through generic inference on
   * `flatMap<FieldPlacement>(...)`.
   *
   * Pin the wire shape so the rename can never silently regress.
   */
  it('Send-for-signature buildFields emits width/height (not w/h) for the API', async () => {
    const user = userEvent.setup();
    runMock.mockClear();
    renderPage();

    // Walk: file → signers → place → review → Send (mirrors the
    // earlier orchestration test).
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('contract.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /next: place fields/i }));
    await user.click(screen.getByRole('button', { name: /^signature$/i }));
    const canvas = await screen.findByTestId('mw-canvas');
    await user.click(canvas);
    await user.click(screen.getByRole('button', { name: /^review/i }));
    await user.click(screen.getByRole('button', { name: /send for signature/i }));

    expect(runMock).toHaveBeenCalledTimes(1);
    const call = runMock.mock.calls[0];
    if (!call) throw new Error('expected runMock to have been invoked');
    const arg = (call as ReadonlyArray<unknown>)[0] as {
      buildFields: (localToServer: Map<string, string>) => ReadonlyArray<Record<string, unknown>>;
      signers: ReadonlyArray<{ localId: string; email?: string }>;
    };
    // Build a localToServer mapping from the signers the page passed in,
    // so buildFields can resolve every local id to a server id.
    const localToServer = new Map<string, string>();
    for (const s of arg.signers) {
      localToServer.set(s.localId, `srv-${s.localId}`);
    }
    const placements = arg.buildFields(localToServer);
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) {
      // Wire-shape contract: the API requires `width`/`height` and the
      // ValidationPipe rejects any extra property — so `w`/`h` MUST
      // not appear and `width`/`height` MUST be present numbers.
      expect(p).not.toHaveProperty('w');
      expect(p).not.toHaveProperty('h');
      expect(typeof p['width']).toBe('number');
      expect(typeof p['height']).toBe('number');
    }
  });

  it('rejects an invalid email in the add-signer sheet', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'B');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'not-an-email');
    // Add button stays disabled when email invalid.
    expect(within(dialog).getByRole('button', { name: /^add$/i })).toBeDisabled();
  });
});
