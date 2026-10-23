import { useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthSplitLayout } from '@/components/AuthSplitLayout';
import { CheckEmailPanel } from '@/components/CheckEmailPanel';
import { useSendMagicLink } from '@/lib/auth/magicLink';

/**
 * L4 page: `/check-email?email=...`. The "Check your email" state as its own
 * route (the same panel renders inline on `/signin` right after a send), so
 * a reload or a shared link still lands somewhere useful. Without an email
 * there is nothing to check, so it goes back to the sign-in screen.
 */
export function CheckEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sendMagicLink = useSendMagicLink();
  const email = (params.get('email') ?? '').trim();

  const handleResend = useCallback(() => sendMagicLink(email), [sendMagicLink, email]);
  const handleChangeEmail = useCallback((): void => {
    navigate('/signin');
  }, [navigate]);

  if (!email) return <Navigate to="/signin" replace />;

  return (
    <AuthSplitLayout>
      <CheckEmailPanel email={email} onResend={handleResend} onChangeEmail={handleChangeEmail} />
    </AuthSplitLayout>
  );
}
