import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Check, Download, Lock, UserPlus, Users } from 'lucide-react';
import { SEAL_DOWNLOAD_ERROR } from 'shared';
import { Button } from '@/components/Button';
import { InfoChip } from '@/components/InfoChip';
import { RetentionNotice } from '@/components/RetentionNotice';
import { SignatureLevelNote } from '@/components/SignatureLevelNote';
import { readDoneSnapshot, safeDownloadName, useSealedDownload } from '@/features/signing';
import { ActionLink, Fine, StatusPage, TextLink } from '@/features/signing/ui/StatusPage';
import { useT } from '@/lib/i18n';
import { Hint } from './SigningDonePage.styles';

/**
 * `/sign/:envelopeId/done` — terminal success screen. Reads the sessionStorage
 * snapshot written by the submit mutation; if missing (user deep-linked),
 * bounce back to the entry page. Download stays disabled until the seal is
 * ready (every signer done, then the worker); "Save a copy" takes the
 * recipient to sign-up with their email prefilled.
 */
export function SigningDonePage() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const t = useT();
  const snap = useMemo(() => readDoneSnapshot(envelopeId), [envelopeId]);

  // Poll the public verify endpoint for this envelope's seal status. The
  // query is gated by `enabled: shortCode.length > 0` inside the hook, so
  // it is safe to mount before the snapshot check below.
  const verify = useSealedDownload(snap?.short_code ?? '');

  if (!snap || snap.kind !== 'submitted') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  const sealedUrl = verify.data?.envelope.status === 'completed' ? verify.data.sealed_url : null;
  const downloadName = safeDownloadName(snap.title, '-signed');
  const total = snap.total_count ?? 0;
  const signed = snap.signed_count ?? 0;
  const left = Math.max(0, total - signed);
  const sender = snap.sender_name;

  const gets = sender
    ? t('signing.sign.done.senderGets', { sender })
    : t('signing.sign.done.senderGetsAnon');
  let others = '';
  if (total > 0) {
    if (left === 0) others = t('signing.sign.done.allSigned');
    else if (left === 1) others = t('signing.sign.done.othersLeftOne');
    else others = t('signing.sign.done.othersLeftMany', { count: left });
  }

  return (
    <StatusPage tone="success" icon={Check} title={t('signing.sign.done.title')}>
      <span>{others ? `${gets} ${others}` : gets}</span>
      {total > 0 ? (
        <InfoChip icon={Users}>{t('signing.sign.done.count', { done: signed, total })}</InfoChip>
      ) : null}

      {sealedUrl ? (
        <ActionLink
          href={sealedUrl}
          download={downloadName}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={16} aria-hidden="true" />
          {t('signing.sign.done.download')}
        </ActionLink>
      ) : (
        <>
          <Button
            variant="secondary"
            iconLeft={left > 0 ? Lock : Download}
            disabled
            loading={left === 0 && !verify.isError}
          >
            {left > 0 ? t('signing.sign.done.downloadLocked') : t('signing.sign.done.preparing')}
          </Button>
          {left === 0 && !verify.isError ? <Hint>{t('signing.sign.done.sealingHint')}</Hint> : null}
        </>
      )}
      {verify.isError && !sealedUrl ? (
        <Hint role="alert" $error>
          {SEAL_DOWNLOAD_ERROR}
        </Hint>
      ) : null}

      <TextLink href={`/signup?email=${encodeURIComponent(snap.recipient_email)}`}>
        <UserPlus size={14} aria-hidden="true" />
        {t('signing.sign.done.saveCopy')}
      </TextLink>

      <Fine>
        <RetentionNotice verifyPath={`/verify/${snap.short_code}`} />
        <SignatureLevelNote />
      </Fine>
    </StatusPage>
  );
}
