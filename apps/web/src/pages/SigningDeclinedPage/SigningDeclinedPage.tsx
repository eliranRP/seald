import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { readDoneSnapshot } from '@/features/signing';
import { Quote, StatusPage } from '@/features/signing/ui/StatusPage';
import { useT } from '@/lib/i18n';
import type { TFn } from '@/lib/i18n';

/**
 * Copy variants. `consent-withdrawn` is the ESIGN §7001(c)(1) path and its
 * wording stays English (D2b); `not-the-recipient` covers "Not me?"; the
 * default decline covers everything else, including older snapshots that
 * carry no `decline_reason`.
 */
function copyFor(
  reason: string | undefined,
  sender: string | null,
  t: TFn,
): { readonly title: string; readonly body: string } {
  const notified = sender
    ? t('signing.sign.declined.notified', { sender })
    : t('signing.sign.declined.notifiedAnon');
  if (reason === 'consent-withdrawn') {
    return {
      title: 'You withdrew consent to sign electronically.',
      body: `${notified} We've recorded the withdrawal in the audit trail.`,
    };
  }
  if (reason === 'not-the-recipient') {
    return {
      title: t('signing.sign.declined.wrongRecipient'),
      body: `${notified} ${t('signing.sign.declined.wrongRecipientBody')}`,
    };
  }
  return { title: t('signing.sign.declined.title'), body: notified };
}

/**
 * `/sign/:envelopeId/declined` — terminal state after the recipient declines.
 * Reads the sessionStorage snapshot; missing → route to entry.
 */
export function SigningDeclinedPage() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const snap = useMemo(() => readDoneSnapshot(envelopeId), [envelopeId]);

  if (!snap || snap.kind !== 'declined') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  const copy = copyFor(snap.decline_reason, snap.sender_name, t);

  return (
    <StatusPage tone="bad" icon={XCircle} title={copy.title}>
      <span>{copy.body}</span>
      {snap.reason_text ? <Quote>{snap.reason_text}</Quote> : null}
      <Button variant="ghost" onClick={() => navigate('/')}>
        {t('signing.sign.declined.close')}
      </Button>
    </StatusPage>
  );
}
