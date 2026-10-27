import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import type { OAuthAuthorizationRequest, OAuthConsentDescription } from 'shared';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ApprovalFrame } from '@/features/approvals/ApprovalFrame';
import { signInPathFor } from '@/features/approvals/model';
import { isConnectedAppsEnabled, SCOPE_LABELS } from '@/features/developers/model';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { useAuth } from '@/providers/AuthProvider';
import { useConsentDecision, useConsentDescription } from './consentApi';
import {
  CONSENT_PATH,
  authorizeErrorFromSearch,
  clearStashedRequest,
  consentErrorCopy,
  readStashedRequest,
  requestFromSearch,
  stashRequest,
} from './consentModel';

const Card = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bg.surface};
  min-width: 0;
`;

const AppName = styled.h2`
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  overflow-wrap: anywhere;
`;

const Line = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  overflow-wrap: anywhere;
`;

const Strong = styled.strong`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

/** Same 14px as the card's other lines, in the primary ink: it is what the user grants. */
const ScopeList = styled.ul`
  margin: ${({ theme }) => theme.space[1]} 0 0;
  padding-left: ${({ theme }) => theme.space[5]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Notice = styled.div<{ $tone: 'warn' | 'error' }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid
    ${({ theme, $tone }) => ($tone === 'warn' ? theme.color.warn[500] : theme.color.danger[500])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme, $tone }) =>
    $tone === 'warn' ? theme.color.warn[50] : theme.color.danger[50]};
  color: ${({ theme, $tone }) =>
    $tone === 'warn' ? theme.color.warn[700] : theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]};

  & > * {
    flex: 1 1 160px;
  }
`;

export interface OAuthConsentPageProps {
  /** Leaves the app for the client's redirect URI. Tests and stories pass a stub. */
  readonly onRedirect?: (url: string) => void;
}

function leaveApp(url: string): void {
  window.location.assign(url);
}

/**
 * `/oauth/mcp/consent` (docs/design/mcp-server.md § OAuth 2.1, step 5):
 * outside `AppShell`, a Supabase session required, no analytics. The
 * owner sees the app's name (and "Unverified" for a CIMD app that is not
 * on the allow-list), where the code goes back to, and what it may do,
 * in the same words as API key scopes. Allow access and Deny both send the
 * browser back to the app with `state`. Approving send-capable access
 * needs a sign-in from the last 10 minutes, like such a key.
 */
export function OAuthConsentPage({ onRedirect = leaveApp }: OAuthConsentPageProps) {
  const enabled = isConnectedAppsEnabled();
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [request] = useState<OAuthAuthorizationRequest | null>(
    () => requestFromSearch(location.search) ?? readStashedRequest(),
  );
  const authorizeError = authorizeErrorFromSearch(location.search);
  const signedIn = user !== null;
  const described = useConsentDescription(request, enabled && signedIn);
  const decide = useConsentDecision();
  const [needsFresh, setNeedsFresh] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const mustSignIn = enabled && request !== null && !loading && !signedIn;
  // One job: park the request and send a signed-out owner to sign in.
  useEffect(() => {
    if (!mustSignIn || request === null) return;
    stashRequest(request);
    navigate(signInPathFor(CONSENT_PATH), { replace: true });
  }, [mustSignIn, navigate, request]);

  if (!enabled) {
    return (
      <ApprovalFrame title="Connect an app">
        <Line role="status">Not available.</Line>
      </ApprovalFrame>
    );
  }
  if (request === null) {
    return (
      <ApprovalFrame title="Connect an app">
        <Notice $tone="error" role="alert">
          {consentErrorCopy(authorizeError)}
        </Notice>
      </ApprovalFrame>
    );
  }
  if (loading || mustSignIn) return <AuthLoadingScreen />;

  const signInAgain = (): void => {
    stashRequest(request);
    void signOut()
      .catch(() => undefined)
      .then(() => {
        navigate(signInPathFor(CONSENT_PATH), { replace: true });
      });
  };

  const choose = (decision: 'approve' | 'deny'): void => {
    setNeedsFresh(false);
    setFailed(null);
    decide.mutate(
      { request, decision },
      {
        onSuccess: (res) => {
          clearStashedRequest();
          onRedirect(res.redirect_to);
        },
        onError: (err) => {
          if (err.code === 'fresh_login_required') setNeedsFresh(true);
          else setFailed(err.code ?? 'error');
        },
      },
    );
  };

  return (
    <ApprovalFrame title="Connect an app">
      {described.isPending ? <Line role="status">Loading the request…</Line> : null}
      {described.isError ? (
        <Notice $tone="error" role="alert">
          {described.error.code === 'email_required'
            ? 'Sign in with an email account to connect apps.'
            : consentErrorCopy(described.error.code)}
        </Notice>
      ) : null}
      {described.data ? (
        <ConsentCard
          description={described.data}
          email={user?.email ?? ''}
          busy={decide.isPending ? (decide.variables.decision ?? null) : null}
          needsFresh={needsFresh || described.data.fresh_login_required}
          failed={failed}
          onApprove={() => {
            choose('approve');
          }}
          onDeny={() => {
            choose('deny');
          }}
          onSignInAgain={signInAgain}
        />
      ) : null}
    </ApprovalFrame>
  );
}

export interface ConsentCardProps {
  readonly description: OAuthConsentDescription;
  readonly email: string;
  readonly busy: 'approve' | 'deny' | null;
  readonly needsFresh: boolean;
  readonly failed: string | null;
  readonly onApprove: () => void;
  readonly onDeny: () => void;
  readonly onSignInAgain: () => void;
}

/** The card itself: who asks, where it returns, what it may do, and the two buttons. */
export function ConsentCard({
  description: d,
  email,
  busy,
  needsFresh,
  failed,
  onApprove,
  onDeny,
  onSignInAgain,
}: ConsentCardProps) {
  return (
    <Card aria-labelledby="consent-app-name">
      <AppName id="consent-app-name">
        {/* The client names itself: isolate its direction so an RTL name reads right. */}
        <bdi>{d.client_name}</bdi>
        {d.unverified ? <Badge tone="amber">Unverified</Badge> : null}
      </AppName>
      <Line>
        wants to use your Seald account. It returns to <Strong>{d.redirect_host}</Strong>.
      </Line>
      {d.unverified ? (
        <Notice $tone="warn">
          Seald has not checked this app. Only continue if you started this from an app you trust.
        </Notice>
      ) : null}
      <div>
        <Line>It will be able to:</Line>
        <ScopeList aria-label="Requested access">
          {d.scopes.map((scope) => (
            <li key={scope}>{SCOPE_LABELS[scope]}</li>
          ))}
        </ScopeList>
      </div>
      <Line>
        Sends, reminders and cancels still wait for your approval by email. Signers always sign from
        their own link.
      </Line>
      <Line>
        Signed in as <Strong>{email}</Strong>. You can disconnect it any time in Settings,
        Developers.
      </Line>
      {needsFresh ? (
        <Notice $tone="warn" role="alert">
          This access needs a sign-in from the last 10 minutes.
          <Button variant="secondary" size="sm" onClick={onSignInAgain}>
            Sign in again
          </Button>
        </Notice>
      ) : null}
      {failed ? (
        <Notice $tone="error" role="alert">
          {consentErrorCopy(failed)}
        </Notice>
      ) : null}
      <Buttons>
        <Button
          variant="primary"
          size="lg"
          disabled={needsFresh || busy !== null}
          loading={busy === 'approve'}
          onClick={onApprove}
        >
          Allow access
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={busy !== null}
          loading={busy === 'deny'}
          onClick={onDeny}
        >
          Deny
        </Button>
      </Buttons>
    </Card>
  );
}
