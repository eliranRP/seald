import { Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthLoadingScreen } from '@/layout/AuthLoadingScreen';
import { isNotYourTurnError, NotYourTurn } from '@/features/signers/signingOrder';
import { useSignMeQuery } from './useSigning';

interface ApiErrorLike extends Error {
  status?: number;
}

/**
 * Public-route guard for the signing flow. Requires a cookie-backed signer
 * session: calls `/sign/me` via react-query and routes back to the entry
 * page on 401 / 410 so the user can re-handshake with a fresh token from
 * their email. Other errors bubble to the `SigningErrorBoundary`.
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
    // WP-06: the signer's step has not been invited yet. Not an error.
    if (isNotYourTurnError(q.error)) {
      return <NotYourTurn onRetry={() => void q.refetch()} />;
    }
    const { status } = q.error as ApiErrorLike;
    if (status === 401 || status === 410) {
      return <Navigate to={`/sign/${envelopeId}`} replace />;
    }
    throw q.error;
  }
  return <Outlet />;
}
