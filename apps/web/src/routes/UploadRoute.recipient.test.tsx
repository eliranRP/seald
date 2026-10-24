import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { UploadRoute } from './UploadRoute';
import { useAppState } from '../providers/AppStateProvider';

vi.mock('../lib/pdf', () => ({
  usePdfDocument: (file: File | null) => ({
    doc: null,
    numPages: file ? 2 : 0,
    loading: false,
    error: null,
  }),
}));

vi.mock('../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url === '/contacts') {
        return {
          data: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              owner_id: 't',
              name: 'Alex Reyes',
              email: 'alex@quill.vc',
              color: '#7DD3FC',
              created_at: '',
              updated_at: '',
            },
          ],
          status: 200,
        };
      }
      return { data: [], status: 200 };
    }),
    post: vi.fn(async () => ({ data: {}, status: 200 })),
    patch: vi.fn(async () => ({ data: {}, status: 200 })),
    delete: vi.fn(async () => ({ data: null, status: 200 })),
  },
}));

function DraftProbe() {
  const { documents } = useAppState();
  const signers = documents[0]?.signers ?? [];
  return (
    <ul aria-label="draft signers">
      {signers.map((s) => (
        <li key={s.id}>{`${s.name} <${s.email}> ${s.id}`}</li>
      ))}
    </ul>
  );
}

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/document/new" element={<UploadRoute />} />
        <Route path="/document/:id" element={<DraftProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function pick(): void {
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'a.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText(/choose file/i), { target: { files: [pdf] } });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('UploadRoute — ?to=<email> (Contacts → Send)', () => {
  it('adds a saved contact next to the sender', async () => {
    renderAt('/document/new?to=alex%40quill.vc');
    // Wait until the contacts list has loaded so the saved contact is found.
    await new Promise((r) => setTimeout(r, 50));
    pick();
    const list = await screen.findByRole('list', { name: 'draft signers' });
    await waitFor(() => {
      expect(list).toHaveTextContent(
        'Alex Reyes <alex@quill.vc> 11111111-1111-4111-8111-111111111111',
      );
    });
    expect(list).toHaveTextContent('jamie@seald.app');
  });

  it('adds a one-off recipient, named from the address, when it is not a saved contact', async () => {
    renderAt('/document/new?to=nora.lee%40acme.co');
    pick();
    const list = await screen.findByRole('list', { name: 'draft signers' });
    expect(list).toHaveTextContent('Nora Lee <nora.lee@acme.co> to:nora.lee@acme.co');
  });

  it('ignores a value that is not an email address', async () => {
    renderAt('/document/new?to=not-an-email');
    pick();
    const list = await screen.findByRole('list', { name: 'draft signers' });
    expect(list.querySelectorAll('li')).toHaveLength(1);
  });
});
