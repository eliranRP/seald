import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { AppRoutes } from './AppRoutes';
import { AppStateProvider } from './providers/AppStateProvider';
import { AuthProvider } from './providers/AuthProvider';
import { seald } from './styles/theme';

// The browser Supabase client is mocked at the module boundary so jsdom
// runs don't spin up network clients. The default stub returns a signed-in
// session so the integration tests below see the app as an authed user;
// tests that need the anonymous path can override this mock per-case.
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

function renderApp(initialEntries: ReadonlyArray<string> = ['/']) {
  return render(
    <ThemeProvider theme={seald}>
      <AuthProvider>
        <AppStateProvider>
          <MemoryRouter initialEntries={[...initialEntries]}>
            <AppRoutes />
          </MemoryRouter>
        </AppStateProvider>
      </AuthProvider>
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

  it('opens the Create signature request dialog immediately after a PDF is chosen', async () => {
    renderApp(['/document/new']);
    const input = (await screen.findByLabelText(/choose pdf file/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(
      screen.getByRole('dialog', { name: /create your signature request/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('cancelling the dialog stays on the upload page and discards picked signers', async () => {
    renderApp(['/document/new']);
    const input = (await screen.findByLabelText(/choose pdf file/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makePdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /add receiver/i }));
    fireEvent.click(await screen.findByRole('option', { name: /eliran azulay/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('region', { name: /upload a pdf/i })).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [makePdf()] } });
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
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
