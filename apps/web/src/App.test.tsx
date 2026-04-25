import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './AppRoutes';
import { AppStateProvider } from './providers/AppStateProvider';
import { AuthProvider } from './providers/AuthProvider';
import { seald } from './styles/theme';

// Mock the PDF parsing hook so the upload-flow tests don't have to wait
// for the 3s defensive fallback in UploadRoute. The real implementation
// pulls in pdfjs-dist and tries to parse the test's stub PDF blob, which
// hangs forever under jsdom. Returning numPages: 1 immediately lets
// UploadRoute open the CreateSignatureRequestDialog right away.
vi.mock('./lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 1, loading: false, error: null }),
}));

// The browser Supabase client is mocked at the module boundary so jsdom
// runs don't spin up network clients. The default stub returns a signed-in
// session so the integration tests below see the app as an authed user.
vi.mock('./lib/supabase/supabaseClient', () => {
  const user = {
    id: 'test-user',
    email: 'jamie@seald.app',
    user_metadata: { name: 'Jamie Okonkwo' },
  };
  const session = { user, access_token: 't' };
  const subscription = { subscription: { unsubscribe: () => {} } };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: subscription }),
        signInWithPassword: async () => ({ data: { session }, error: null }),
        signUp: async () => ({ data: { session, user }, error: null }),
        signInWithOAuth: async () => ({ data: {}, error: null }),
        resetPasswordForEmail: async () => ({ data: {}, error: null }),
        signOut: async () => ({ error: null }),
      },
    },
    setKeepSignedIn: () => {},
    getKeepSignedIn: () => true,
    KEEP_SIGNED_IN_STORAGE_KEY: 'sealed.keepSignedIn',
  };
});

// The axios `apiClient` is mocked so the contacts React-Query hooks see a
// stable seed list without hitting the network. Create/update/delete each
// echo their input so optimistic mutations settle cleanly.
vi.mock('./lib/api/apiClient', () => {
  const SEED = [
    {
      id: 'c1',
      owner_id: 'test-user',
      name: 'Eliran Azulay',
      email: 'eliran@azulay.co',
      color: '#F472B6',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c2',
      owner_id: 'test-user',
      name: 'Nitsan Yanovitch',
      email: 'nitsan@yanov.co',
      color: '#7DD3FC',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c3',
      owner_id: 'test-user',
      name: 'Ana Torres',
      email: 'ana@farrow.law',
      color: '#10B981',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c4',
      owner_id: 'test-user',
      name: 'Meilin Chen',
      email: 'meilin@chen.co',
      color: '#F59E0B',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c5',
      owner_id: 'test-user',
      name: 'Priya Kapoor',
      email: 'priya@kapoor.com',
      color: '#818CF8',
      created_at: '',
      updated_at: '',
    },
  ];
  return {
    apiClient: {
      get: vi.fn(async (url: string) => {
        if (url === '/contacts') return { data: SEED, status: 200 };
        return { data: {}, status: 200 };
      }),
      post: vi.fn(async (_url: string, body: { name: string; email: string; color: string }) => ({
        data: {
          id: `c_new_${Date.now()}`,
          owner_id: 'test-user',
          name: body.name,
          email: body.email,
          color: body.color,
          created_at: '',
          updated_at: '',
        },
        status: 201,
      })),
      patch: vi.fn(async (url: string, body: Record<string, unknown>) => ({
        data: {
          id: url.split('/').pop(),
          owner_id: 'test-user',
          ...body,
          created_at: '',
          updated_at: '',
        },
        status: 200,
      })),
      delete: vi.fn(async () => ({ data: null, status: 204 })),
    },
  };
});

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderApp(initialEntries: ReadonlyArray<string> = ['/']) {
  const qc = buildQueryClient();
  return render(
    <ThemeProvider theme={seald}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <AppStateProvider>
            <MemoryRouter initialEntries={[...initialEntries]}>
              <AppRoutes />
            </MemoryRouter>
          </AppStateProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function makePdf(name = 'contract.pdf', sizeBytes = 1024): File {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('App routing', () => {
  it('redirects root to the Dashboard', async () => {
    renderApp(['/']);
    expect(
      await screen.findByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
  });

  it('clicking "New document" on the Dashboard navigates to the upload flow', async () => {
    renderApp(['/documents']);
    fireEvent.click(await screen.findByRole('button', { name: /new document/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
  });

  it('clicking the Sign NavBar tab navigates to /document/new', async () => {
    renderApp(['/documents']);
    fireEvent.click(await screen.findByRole('button', { name: /^sign$/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
  });

  // With the `vi.mock('./lib/pdf', ...)` at the top of this file,
  // `usePdfDocument` synchronously reports numPages: 1, so UploadRoute
  // opens the CreateSignatureRequestDialog immediately. The default
  // findBy timeout (1s) is therefore plenty.
  const DIALOG_TIMEOUT = { timeout: 1000 };

  it('opens the Create signature request dialog immediately after a PDF is chosen', async () => {
    renderApp(['/document/new']);
    const input = (await screen.findByLabelText(/choose pdf file/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(
      await screen.findByRole('dialog', { name: /create your signature request/i }, DIALOG_TIMEOUT),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('cancelling the dialog stays on the upload page and discards picked signers', async () => {
    renderApp(['/document/new']);
    const input1 = (await screen.findByLabelText(/choose pdf file/i)) as HTMLInputElement;
    fireEvent.change(input1, { target: { files: [makePdf()] } });
    fireEvent.click(await screen.findByRole('button', { name: /add receiver/i }, DIALOG_TIMEOUT));
    fireEvent.click(await screen.findByRole('option', { name: /eliran azulay/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
    // After cancel, UploadPage remounts the Dropzone (status flips back to
    // 'idle'), so the file input is a fresh DOM node — re-query it.
    const input2 = (await screen.findByLabelText(/choose pdf file/i)) as HTMLInputElement;
    fireEvent.change(input2, { target: { files: [makePdf()] } });
    expect(await screen.findByRole('button', { name: /apply/i }, DIALOG_TIMEOUT)).toBeDisabled();
    expect(screen.queryAllByRole('button', { name: /remove receiver/i })).toHaveLength(0);
  });

  it('Signers page lists seed contacts', async () => {
    renderApp(['/signers']);
    expect(
      await screen.findByRole('heading', { level: 1, name: /people you send documents to/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/eliran@azulay.co/i)).toBeInTheDocument();
  });

  it('Signers page opens the add dialog', async () => {
    renderApp(['/signers']);
    fireEvent.click(await screen.findByRole('button', { name: /^add signer$/i }));
    expect(screen.getByRole('dialog', { name: /^add signer$/i })).toBeInTheDocument();
  });
});
