import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { UploadRoute } from './UploadRoute';
import { setTemplates } from '../features/templates';
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

// `SignersStepCard` is the same widget the templates wizard uses;
// stub it to a tiny shim with "Add Jamie" + "Apply" + a signer-count
// readout so tests can drive the flow deterministically without the
// inline contact picker's full DOM tree.
vi.mock('../components/SignersStepCard', () => ({
  SignersStepCard: (props: {
    signers: ReadonlyArray<{ readonly id: string; readonly name: string }>;
    onPickContact: (c: {
      readonly id: string;
      readonly name: string;
      readonly email: string;
      readonly color: string;
    }) => void;
    onContinue: () => void;
  }): JSX.Element => {
    return (
      <div data-testid="signer-dialog">
        <button
          type="button"
          onClick={() =>
            props.onPickContact({
              id: 'c-jamie',
              name: 'Jamie Okonkwo',
              email: 'jamie@seald.app',
              color: '#818CF8',
            })
          }
        >
          Add Jamie
        </button>
        <button type="button" onClick={() => props.onContinue()}>
          Apply
        </button>
        <span data-testid="signer-count">{props.signers.length}</span>
      </div>
    );
  },
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
    const input = screen.getByLabelText(/choose pdf file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf('contract.pdf')] } });

    // The mocked `usePdfDocument` reports 6 pages — same as SAMPLE, so
    // every layout entry resolves and no page-count warning fires.
    const addBtn = await screen.findByRole('button', { name: /add jamie/i });
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(screen.getByTestId('signer-count')).toHaveTextContent('1');
    });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

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
    expect(
      screen.queryByRole('button', { name: /start from a template/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the template picker when the CTA is clicked, and ?template= is set on pick', async () => {
    renderAt('/document/new');
    fireEvent.click(screen.getByRole('button', { name: /start from a template/i }));
    const dialog = await screen.findByRole('dialog', { name: /choose a template/i });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(SAMPLE.name, 'i') }));
    await waitFor(() => {
      // Banner means `?template=` was applied + template resolved.
      expect(screen.getByRole('status')).toHaveTextContent(/using template/i);
      expect(screen.getByRole('status')).toHaveTextContent(SAMPLE.name);
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
});
