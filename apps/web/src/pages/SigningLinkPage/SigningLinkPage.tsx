import { useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { NotYourTurn } from '@/features/signers/signingOrder';
import {
  clearLinkHints,
  isLinkStateKey,
  readLinkHints,
  requestNewLink,
  safeDownloadName,
  useSealedDownload,
} from '@/features/signing';
import { ActionLink, StatusPage } from '@/features/signing/ui/StatusPage';
import { useT } from '@/lib/i18n';
import type { LinkHints } from '@/features/signing';

function formatSignedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Signed({ hints }: { readonly hints: LinkHints }) {
  const t = useT();
  const verify = useSealedDownload(hints.short_code ?? '');
  const sealedUrl = verify.data?.envelope.status === 'completed' ? verify.data.sealed_url : null;
  const on = hints.signed_at ? formatSignedOn(hints.signed_at) : '';
  let download: ReactNode = null;
  if (sealedUrl) {
    download = (
      <ActionLink
        href={sealedUrl}
        download={safeDownloadName(verify.data?.envelope.title ?? 'document', '-signed')}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download size={16} aria-hidden="true" />
        {t('signing.sign.done.download')}
      </ActionLink>
    );
  } else if (hints.short_code) {
    download = (
      <Button variant="secondary" iconLeft={Lock} disabled>
        {t('signing.sign.done.downloadLocked')}
      </Button>
    );
  }
  return (
    <StatusPage tone="ok" icon={CheckCircle2} title={t('signing.sign.link.signed.title')}>
      <span>
        {on ? t('signing.sign.link.signed.on', { date: on }) : t('signing.sign.link.signed.body')}
      </span>
      {download}
    </StatusPage>
  );
}

function Expired({
  envelopeId,
  hints,
}: {
  readonly envelopeId: string;
  readonly hints: LinkHints;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const sender = hints.sender_name;

  const ask = (): void => {
    if (!hints.token) return;
    setState('busy');
    requestNewLink({ envelope_id: envelopeId, token: hints.token })
      .then(() => setState('done'))
      .catch(() => setState('error'));
  };

  let body: ReactNode;
  if (state === 'done') {
    body = (
      <>
        <Button variant="ghost" iconLeft={Check} disabled>
          {t('signing.sign.link.expired.requested')}
        </Button>
        <span>
          {sender
            ? t('signing.sign.link.expired.sent', { sender })
            : t('signing.sign.link.expired.sentAnon')}
        </span>
      </>
    );
  } else if (hints.token) {
    body = (
      <>
        <Button iconLeft={Send} onClick={ask} loading={state === 'busy'}>
          {t('signing.sign.link.expired.ask')}
        </Button>
        {state === 'error' ? (
          <span role="alert">{t('signing.sign.link.expired.error')}</span>
        ) : null}
      </>
    );
  } else {
    body = <span>{t('signing.sign.link.expired.noToken')}</span>;
  }
  return (
    <StatusPage tone="warn" icon={Clock} title={t('signing.sign.link.expired.title')}>
      {body}
    </StatusPage>
  );
}

/**
 * `/sign/:envelopeId/link/:state` — the screen for a link that cannot open
 * the document: already signed, declined, expired, withdrawn, not your turn,
 * or not valid. Public, no session. The entry page lands here after the API
 * refuses the link, leaving the few facts the screen needs in sessionStorage.
 */
export function SigningLinkPage() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string; readonly state: string }>();
  const envelopeId = params.envelopeId ?? '';
  const state = params.state;
  const hints = readLinkHints(envelopeId);

  if (!isLinkStateKey(state)) {
    return <Navigate to={`/sign/${envelopeId}/link/invalid`} replace />;
  }
  const sender = hints.sender_name;

  switch (state) {
    case 'signed':
      return <Signed hints={hints} />;
    case 'declined':
      return (
        <StatusPage tone="bad" icon={XCircle} title={t('signing.sign.link.declined.title')}>
          <span>{t('signing.sign.link.declined.body')}</span>
        </StatusPage>
      );
    case 'expired':
      return <Expired envelopeId={envelopeId} hints={hints} />;
    case 'withdrawn':
      return (
        <StatusPage tone="neutral" icon={Ban} title={t('signing.sign.link.withdrawn.title')}>
          <span>
            {sender
              ? t('signing.sign.link.withdrawn.body', { sender })
              : t('signing.sign.link.withdrawn.bodyAnon')}
          </span>
        </StatusPage>
      );
    case 'notyet':
      return (
        <NotYourTurn
          senderName={sender}
          waitingOn={hints.waiting_on}
          onRetry={() => {
            // Try the original link again; the entry page asks the API afresh.
            const again = hints.token
              ? `/sign/${envelopeId}?t=${encodeURIComponent(hints.token)}`
              : `/sign/${envelopeId}`;
            clearLinkHints(envelopeId);
            navigate(again, { replace: true });
          }}
        />
      );
    case 'invalid':
      return (
        <StatusPage tone="bad" icon={AlertCircle} title={t('signing.sign.link.invalid.title')}>
          <span>
            {sender
              ? t('signing.sign.link.invalid.body', { sender })
              : t('signing.sign.link.invalid.bodyAnon')}
          </span>
          <Button
            variant="ghost"
            iconLeft={RefreshCw}
            onClick={() => {
              const again = hints.token
                ? `/sign/${envelopeId}?t=${encodeURIComponent(hints.token)}`
                : `/sign/${envelopeId}`;
              navigate(again, { replace: true });
            }}
          >
            {t('signing.sign.link.invalid.retry')}
          </Button>
        </StatusPage>
      );
  }
}
