import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAppState } from '../providers/AppStateProvider';
import { UploadRoute } from './UploadRoute';
import { setTemplates } from '../features/templates';

vi.mock('../lib/pdf', () => ({
  usePdfDocument: (file: File | null) => ({
    doc: null,
    numPages: file ? 4 : 0,
    loading: false,
    error: null,
  }),
  readPdfInfo: async (file: File) => {
    if (file.name.startsWith('bad')) throw new Error('not a pdf');
    return { pages: file.name.startsWith('side') ? 1 : 4, aspect: 1.4 };
  },
}));

vi.mock('../components/SignersStepCard', () => ({
  SignersStepCard: (props: {
    subtitle?: string;
    onPickContact: (c: {
      readonly id: string;
      readonly name: string;
      readonly email: string;
      readonly color: string;
    }) => void;
    onContinue: () => void;
  }): JSX.Element => (
    <div>
      <p>{props.subtitle}</p>
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
    </div>
  ),
}));

function DraftProbe(): JSX.Element {
  const { documents } = useAppState();
  const draft = documents[0];
  return (
    <div>
      <div data-testid="draft-title">{draft?.title ?? ''}</div>
      <ol aria-label="draft documents">
        {(draft?.documents ?? []).map((d) => (
          <li key={d.id}>{`${d.title}:${String(d.totalPages)}`}</li>
        ))}
      </ol>
    </div>
  );
}

function renderUpload() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/document/new']}>
      <Routes>
        <Route path="/document/new" element={<UploadRoute />} />
        <Route path="/document/:id" element={<DraftProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function pdf(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

function setFlag(on: boolean): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
    (flag: string) => on && flag === 'multiDocumentEnvelopes',
  );
}

describe('UploadRoute with several files', () => {
  beforeEach(() => {
    setTemplates([]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carries every picked PDF into the draft, in order, and says how many to sign', async () => {
    setFlag(true);
    renderUpload();
    fireEvent.change(screen.getByLabelText('Choose PDF files'), {
      target: { files: [pdf('Master agreement.pdf'), pdf('side letter.pdf'), pdf('Schedule.pdf')] },
    });

    expect(await screen.findByText(/sign these 3 documents/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add jamie/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    const list = await screen.findByRole('list', { name: 'draft documents' });
    await waitFor(() => {
      expect(list.querySelectorAll('li')).toHaveLength(3);
    });
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Master agreement:4',
      'side letter:1',
      'Schedule:4',
    ]);
    expect(screen.getByTestId('draft-title')).toHaveTextContent('Master agreement');
  });

  it('a single picked PDF makes a plain single-document draft', async () => {
    setFlag(true);
    renderUpload();
    fireEvent.change(screen.getByLabelText('Choose PDF files'), {
      target: { files: [pdf('only.pdf')] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /add jamie/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    await screen.findByTestId('draft-title');
    expect(screen.getByTestId('draft-title')).toHaveTextContent('only');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('with the flag off the picker takes one file and never builds a document list', async () => {
    setFlag(false);
    renderUpload();
    const input = screen.getByLabelText('Choose PDF file');
    expect(input).not.toHaveAttribute('multiple');
    fireEvent.change(input, { target: { files: [pdf('only.pdf')] } });
    fireEvent.click(await screen.findByRole('button', { name: /add jamie/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await screen.findByTestId('draft-title');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
