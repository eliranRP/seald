import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OAuthConsentDescription } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider';
import { consentKey } from './consentApi';
import { requestFromSearch } from './consentModel';
import { ConsentCard, OAuthConsentPage } from './OAuthConsentPage';

// Flags are compile-time constants. Stories turn them on through the
// documented test override so the page renders.
interface OverrideHost {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}
function withOAuth(): void {
  (globalThis as OverrideHost).__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
}

function noop(): void {
  /* story stub */
}
async function asyncNoop(): Promise<void> {
  return Promise.resolve();
}

const AUTH: AuthContextValue = {
  session: null,
  user: { id: 'story-user', email: 'jamie@example.com', name: 'Jamie Okonkwo' },
  guest: false,
  loading: false,
  signInWithPassword: asyncNoop,
  signUpWithPassword: () => Promise.resolve({ needsEmailConfirmation: false }),
  signInWithGoogle: asyncNoop,
  resetPassword: asyncNoop,
  resendSignUpConfirmation: asyncNoop,
  signOut: asyncNoop,
  enterGuestMode: asyncNoop,
  exitGuestMode: noop,
};

const SEARCH = `?${new URLSearchParams({
  response_type: 'code',
  client_id: 'claude-story',
  redirect_uri: 'https://claude.example/api/mcp/auth_callback',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
  scope: 'envelopes:read envelopes:write envelopes:send',
  state: 'story',
  resource: 'https://api.seald.example/mcp',
}).toString()}`;

const VERIFIED: OAuthConsentDescription = {
  client_name: 'Claude',
  redirect_host: 'claude.example',
  unverified: false,
  scopes: ['envelopes:read', 'envelopes:write', 'envelopes:send'],
  fresh_login_required: false,
};

function Page({ description }: { readonly description: OAuthConsentDescription }) {
  withOAuth();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(consentKey(requestFromSearch(SEARCH)), description);
  return (
    <AuthContext.Provider value={AUTH}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/oauth/mcp/consent${SEARCH}`]}>
          <Routes>
            <Route path="/oauth/mcp/consent" element={<OAuthConsentPage onRedirect={noop} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof OAuthConsentPage> = {
  title: 'L4/OAuth/OAuthConsentPage',
  component: OAuthConsentPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof OAuthConsentPage>;

export const PreRegisteredApp: Story = {
  render: () => <Page description={VERIFIED} />,
};

export const UnverifiedApp: Story = {
  render: () => (
    <Page
      description={{
        ...VERIFIED,
        client_name: 'Agent Example',
        redirect_host: 'agent.example.org',
        unverified: true,
        scopes: ['envelopes:read'],
      }}
    />
  ),
};

export const NeedsFreshSignIn: Story = {
  render: () => <Page description={{ ...VERIFIED, fresh_login_required: true }} />,
};

export const CardApproving: Story = {
  render: () => (
    <div style={{ padding: 16, maxWidth: 560 }}>
      <ConsentCard
        description={VERIFIED}
        email="jamie@example.com"
        busy="approve"
        needsFresh={false}
        failed={null}
        onApprove={noop}
        onDeny={noop}
        onSignInAgain={noop}
      />
    </div>
  ),
};
