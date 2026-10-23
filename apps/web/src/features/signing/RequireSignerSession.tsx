import { Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { isNotYourTurnError, NotYourTurn } from '@/features/signers/signingOrder';
import { hintsFromError, linkStateFor, stashLinkHints } from './linkState';
import { useSignMeQuery } from './useSigning';

interface ApiErrorLike extends Error {
  status?: number;
  sender_name?: string;
  waiting_on?: string;
  signed_at?: string;
  short_code?: string;
}

/**
 * Public-route guard for the signing flow. Requires a cookie-backed signer
 * session: calls `/sign/me` via react-query and, when the link no longer
 * opens the document (signed, expired, withdrawn, no session), sends the
 * signer to the matching link-state screen. Other errors bubble to the
 * `SigningErrorBoundary`.
 */
export function RequireSignerSession() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const q = useSignMeQuery(envelopeId, Boolean(envelopeId));

  if (!envelopeId) {
    return <Navigate to="/" replace />;
  }
  if (q.isPending) {
    return <AuthLoadingScreen />;
  }
  if (q.error) {
    const err = q.error as ApiErrorLike;
    // WP-06: the signer's step has not been invited yet. Not an error.
    if (isNotYourTurnError(err)) {
      return (
        <NotYourTurn
          onRetry={() => void q.refetch()}
          waitingOn={err.waiting_on}
          senderName={err.sender_name}
        />
      );
    }
    if (err.status === 401 || err.status === 410) {
      const link = linkStateFor(err) ?? 'invalid';
      stashLinkHints(envelopeId, hintsFromError(err, null));
      return <Navigate to={`/sign/${envelopeId}/link/${link}`} replace />;
    }
    throw q.error;
  }
  return <Outlet />;
}
