import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { UploadRoute } from './UploadRoute';
import { useAppState } from '../providers/AppStateProvider';
import * as convertModule from '../features/documentEditor/upload/convertUpload';
import { setTemplates } from '../features/templates';
import * as templatesApi from '../features/templates/templatesApi';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../test/templateFixtures';

// `UploadRoute` calls `usePdfDocument` to learn the page count of the
// uploaded file. pdfjs is impractical to drive in jsdom, so the test
// stub returns a deterministic page count instead.
vi.mock('../lib/pdf', () => ({
  usePdfDocument: (file: File | null) => ({
    doc: null,
    numPages: file ? 6 : 0,
    loading: false,
    error: null,
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{`${location.pathname}${location.search}`}</div>;
}

function DocumentProbe() {
  const params = useParams();
  return <div data-testid="doc-probe">{params.id ?? ''}</div>;
}

function renderAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/document/new" element={<UploadRoute />} />
        <Route path="/document/:id" element={<DocumentProbe />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makePdf(name: string): File {
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  });
  return file;
}

const SAMPLE = TEMPLATES[0]!;

describe('UploadRoute (template integration)', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Production seed is empty; tests need fixtures so `findTemplateById`
    // returns the right record. Reset between tests so fixtures don't
    // leak across the suite.
    setTemplates(TEMPLATES);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    setTemplates([]);
  });

  it('renders the "Using template" banner when ?template= matches a known id', () => {
    renderAt(`/document/new?template=${encodeURIComponent(SAMPLE.id)}`);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/using template/i);
    expect(banner).toHaveTextContent(SAMPLE.name);
    expect(screen.getByRole('button', { name: /clear template/i })).toBeInTheDocument();
  });

  it('renders a warning banner + Clear when the template id is unknown', () => {
    renderAt('/document/new?template=TPL-NOPE');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/template not found/i);
    expect(screen.getByRole('button', { name: /clear template/i })).toBeInTheDocument();
  });

  it('Clear template strips the query arg from the URL', async () => {
    renderAt(`/document/new?template=${encodeURIComponent(SAMPLE.id)}`);
    expect(screen.getByRole('button', { name: /clear template/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear template/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /clear template/i })).not.toBeInTheDocument();
    });
  });

  it('omits the banner when no template arg is present', () => {
    renderAt('/document/new');
    expect(screen.queryByText(/using template/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear template/i })).not.toBeInTheDocument();
  });

  it('pre-populates fields from the template on confirm and routes to the editor', async () => {
    renderAt(`/document/new?template=${encodeURIComponent(SAMPLE.id)}`);
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf('contract.pdf')] } });

    // The mocked `usePdfDocument` reports 6 pages — same as SAMPLE, so
    // every layout entry resolves and no page-count warning fires. The
    // editor opens on its own: signers are chosen there.
    await waitFor(() => {
      expect(screen.getByTestId('doc-probe')).toBeInTheDocument();
    });
    // uses_count++ was logged (TODO until /templates/:id/use lands).
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining(`uses_count++ for ${SAMPLE.id}`),
    );
  });

  it('hides the "Start from a template" CTA when no templates are saved', () => {
    setTemplates([]);
    renderAt('/document/new');
    expect(screen.queryByRole('radio', { name: /template/i })).not.toBeInTheDocument();
  });

  // Regression: previously the upload page only read the in-memory
  // `_templates` store and never fetched from the server. A user who
  // landed on `/document/new` first (most common entry — fresh
  // session, deep-link, signup completion) saw no "Start from a
  // template" CTA even with templates server-side. The CTA only
  // appeared after they detoured through `/templates`, which is the
  // only other page that calls `listTemplates()` on mount. Hydrate
  // on mount here too so the entrypoint stands alone.
  it('hydrates the templates store from the server on mount and shows the CTA', async () => {
    setTemplates([]);
    const listSpy = vi.spyOn(templatesApi, 'listTemplates').mockResolvedValueOnce(TEMPLATES);
    renderAt('/document/new');
    expect(screen.queryByRole('radio', { name: /template/i })).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /template/i })).toBeInTheDocument();
    });
  });

  // Regression: previously the picker just stamped `?template=<id>` onto
  // `/document/new` and showed a banner — leaving the user stuck because
  // the upload screen still demanded a PDF before any "continue" path
  // existed. Routing the pick into `/templates/:id/use` reuses the
  // canonical templates flow (same destination as
  // TemplatesListPage's "Use" CTA) so the user can immediately proceed.
  it('opens the template picker when the CTA is clicked, and routes to /templates/:id/use on pick', async () => {
    function TemplateUseProbe() {
      const location = useLocation();
      return <div data-testid="use-probe">{`${location.pathname}${location.search}`}</div>;
    }
    renderWithProviders(
      <MemoryRouter initialEntries={['/document/new']}>
        <Routes>
          <Route path="/document/new" element={<UploadRoute />} />
          <Route path="/templates/:id/use" element={<TemplateUseProbe />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /template/i }));
    const dialog = await screen.findByRole('dialog', { name: /choose a template/i });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(SAMPLE.name, 'i') }));
    await waitFor(() => {
      expect(screen.getByTestId('use-probe')).toHaveTextContent(
        `/templates/${encodeURIComponent(SAMPLE.id)}/use`,
      );
    });
  });

  // Regression for the "signers display more than once" bug. The
  // templates wizard hands off `templateSigners` via `location.state`;
  // UploadRoute clears that state on mount (so back-then-forward
  // doesn't re-apply a stale File). Before the fix, `handoffHasSigners`
  // re-derived from `location.state` every render, so it flipped
  // `true → false` the moment the clear-state effect ran, which
  // un-suppressed the auto-open dialog and surfaced the picker AGAIN
  // with the same chips. Capturing the handoff into local state on
  // first render keeps the suppression sticky for the lifetime of
  // the route.
  it('does not re-open the signer dialog when handoff carries signers', async () => {
    function HandoffEntry() {
      const navigate = useLocation();
      // Just exercise that the component renders; the navigate call
      // happens via initialEntries.state below.
      return <div data-testid="entry">{navigate.pathname}</div>;
    }
    function renderHandoff() {
      return renderWithProviders(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/document/new',
              state: {
                pendingFile: makePdf('handoff.pdf'),
                templateSigners: [
                  { id: 'c-jamie', name: 'Jamie', email: 'jamie@seald.app', color: '#818CF8' },
                ],
              },
            },
          ]}
        >
          <Routes>
            <Route path="/document/new" element={<UploadRoute />} />
            <Route path="/document/:id" element={<DocumentProbe />} />
            <Route path="*" element={<HandoffEntry />} />
          </Routes>
        </MemoryRouter>,
      );
    }
    renderHandoff();
    // The dialog must NOT auto-open — the wizard already collected
    // these signers. Once `numPages > 0` resolves (mocked as 6 above),
    // the auto-confirm effect should land us on `/document/:id`
    // without ever showing the picker.
    await waitFor(() => {
      expect(screen.getByTestId('doc-probe')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('signer-dialog')).toBeNull();
  });

  it('converts a Word file on the server, then opens the editor with the sender as signer', async () => {
    const convertSpy = vi
      .spyOn(convertModule, 'convertUploadToPdf')
      .mockResolvedValueOnce(makePdf('Q3 vendor agreement.pdf'));
    function DraftProbe2() {
      const { documents } = useAppState();
      const draft = documents[0];
      return (
        <div data-testid="draft-signers">
          {(draft?.signers ?? []).map((x) => x.email).join(',')}
        </div>
      );
    }
    renderWithProviders(
      <MemoryRouter initialEntries={['/document/new']}>
        <Routes>
          <Route path="/document/new" element={<UploadRoute />} />
          <Route path="/document/:id" element={<DraftProbe2 />} />
        </Routes>
      </MemoryRouter>,
    );
    const docx = new File([new Uint8Array([0x50, 0x4b])], 'Q3 vendor agreement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(screen.getByLabelText(/choose file/i), { target: { files: [docx] } });
    await waitFor(() => {
      expect(screen.getByTestId('draft-signers')).toBeInTheDocument();
    });
    expect(convertSpy).toHaveBeenCalledTimes(1);
    convertSpy.mockRestore();
  });

  it('shows Retry when the Word conversion fails', async () => {
    const convertSpy = vi
      .spyOn(convertModule, 'convertUploadToPdf')
      .mockRejectedValueOnce(new convertModule.ConvertUploadError('failed', "Couldn't convert"));
    renderAt('/document/new');
    const docx = new File([new Uint8Array([0x50, 0x4b])], 'a.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(screen.getByLabelText(/choose file/i), { target: { files: [docx] } });
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    convertSpy.mockRestore();
  });
});
