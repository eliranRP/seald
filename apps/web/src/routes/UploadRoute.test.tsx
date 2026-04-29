import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { UploadRoute } from './UploadRoute';
import { TEMPLATES } from '../features/templates';

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

// `CreateSignatureRequestDialog` pulls in heavy chrome that isn't
// relevant to the template-wiring assertions; replace it with a tiny
// shim that exposes "Add Jamie" + "Apply" buttons so we can drive the
// flow deterministically.
vi.mock('../components/CreateSignatureRequestDialog', () => ({
  CreateSignatureRequestDialog: (props: {
    open: boolean;
    signers: ReadonlyArray<{ readonly id: string; readonly name: string }>;
    onAddFromContact: (c: {
      readonly id: string;
      readonly name: string;
      readonly email: string;
      readonly color: string;
    }) => void;
    onApply: () => void;
  }): JSX.Element | null => {
    if (!props.open) return null;
    return (
      <div data-testid="signer-dialog">
        <button
          type="button"
          onClick={() =>
            props.onAddFromContact({
              id: 'c-jamie',
              name: 'Jamie Okonkwo',
              email: 'jamie@seald.app',
              color: '#818CF8',
            })
          }
        >
          Add Jamie
        </button>
        <button type="button" onClick={() => props.onApply()}>
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
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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
});
