import { useState } from 'react';
import { ChevronDown, Copy, Download, List } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { Button } from '@/components/Button';
import { ButtonRoot } from '@/components/Button/Button.styles';
import { Icon } from '@/components/Icon';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { padesLabel } from '@/features/verify';
import type { VerifyResponse } from '@/features/verify';
import { formatDateTime } from './verdict';
import {
  DetailsCard,
  DetailsFoot,
  Expander,
  KvAction,
  KvKey,
  KvList,
  KvRow,
  KvVal,
  Meta,
} from './VerifyPage.styles';

// A download attribute makes the browser save the file under a readable name
// instead of the opaque presigned-URL path.
function safeDownloadName(title: string, suffix: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug.length > 0 ? slug : 'document'}${suffix}.pdf`;
}

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly hash?: boolean;
  readonly ariaLabel?: string;
  readonly copyLabel?: string;
  readonly dash?: boolean;
  readonly danger?: boolean;
  readonly onCopy: (text: string) => void;
}

function Row({ label, value, hash, ariaLabel, copyLabel, dash, danger, onCopy }: RowProps) {
  // Phone rows get the 44px touch target (board: VerifyMobile kv-row).
  const isMobile = useIsMobileViewport();
  return (
    <KvRow $danger={danger === true}>
      <KvKey>{label}</KvKey>
      <KvVal $hash={hash === true} aria-label={ariaLabel} title={hash ? value : undefined}>
        {value}
      </KvVal>
      <KvAction>
        {copyLabel ? (
          <Button
            variant="ghost"
            size={isMobile ? 'md' : 'sm'}
            iconOnly
            iconLeft={Copy}
            aria-label={copyLabel}
            onClick={() => onCopy(value)}
          />
        ) : null}
        {dash ? <Meta aria-hidden>—</Meta> : null}
      </KvAction>
    </KvRow>
  );
}

interface TechDetailsProps {
  readonly data: VerifyResponse;
  readonly sealed: boolean;
  readonly tampered: boolean;
  readonly onCopy: (text: string) => void;
}

/**
 * Collapsed "Technical details" card. Open by default only when the audit
 * chain is broken. Full 64-hex hashes stay in the DOM; CSS truncates them.
 */
export function TechDetails({ data, sealed, tampered, onCopy }: TechDetailsProps) {
  const [open, setOpen] = useState(tampered);
  const { envelope } = data;
  const docs = isFeatureEnabled('multiDocumentEnvelopes') ? (data.documents ?? []) : [];
  const multiDoc = docs.length > 1;
  const events = envelope.event_count ?? data.events.length;
  const pades = padesLabel(envelope.seal);
  const sealedAt = envelope.sealed_at ?? envelope.completed_at;
  const stamp = `${formatDateTime(sealedAt)}${envelope.tsa_name ? ` · ${envelope.tsa_name}` : ''}`;

  return (
    <DetailsCard aria-label="Technical details">
      <Expander
        type="button"
        aria-expanded={open}
        aria-controls="verify-technical-details"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={List} size={16} />
        Technical details
        <Icon icon={ChevronDown} size={16} />
      </Expander>
      {open ? (
        <div id="verify-technical-details">
          <KvList>
            <Row
              label="Envelope ID"
              value={envelope.short_code}
              copyLabel="Copy envelope ID"
              onCopy={onCopy}
            />
            {sealed && !multiDoc && envelope.sealed_sha256 ? (
              <Row
                label="Sealed SHA-256"
                value={envelope.sealed_sha256}
                hash
                ariaLabel="Sealed SHA-256 hash"
                copyLabel="Copy sealed hash"
                onCopy={onCopy}
              />
            ) : null}
            {sealed && !multiDoc && envelope.original_sha256 ? (
              <Row
                label="Original SHA-256"
                value={envelope.original_sha256}
                hash
                ariaLabel="Original SHA-256 hash"
                copyLabel="Copy original hash"
                onCopy={onCopy}
              />
            ) : null}
            {sealed && multiDoc
              ? docs.flatMap((doc) => [
                  doc.sealed_sha256 ? (
                    <Row
                      key={`${doc.id}-sealed`}
                      label={`Sealed SHA-256 · ${doc.ord}`}
                      value={doc.sealed_sha256}
                      hash
                      ariaLabel={`Sealed SHA-256 hash of ${doc.title}`}
                      copyLabel={`Copy sealed hash of ${doc.title}`}
                      onCopy={onCopy}
                    />
                  ) : null,
                  doc.original_sha256 ? (
                    <Row
                      key={`${doc.id}-original`}
                      label={`Original SHA-256 · ${doc.ord}`}
                      value={doc.original_sha256}
                      hash
                      ariaLabel={`Original SHA-256 hash of ${doc.title}`}
                      copyLabel={`Copy original hash of ${doc.title}`}
                      onCopy={onCopy}
                    />
                  ) : null,
                ])
              : null}
            {sealed && pades ? <Row label="Signature" value={pades} dash onCopy={onCopy} /> : null}
            {sealed ? (
              <Row
                label={envelope.seal?.timestamped ? 'Timestamp' : 'Sealed'}
                value={stamp}
                onCopy={onCopy}
              />
            ) : null}
            <Row label="Audit events" value={`${events} · hash-chained`} onCopy={onCopy} />
          </KvList>
          <DetailsFoot>
            {sealed && data.sealed_url && !multiDoc ? (
              <ButtonRoot
                as="a"
                $variant="ghost"
                $size="sm"
                $fullWidth={false}
                $iconOnly={false}
                href={data.sealed_url}
                target="_blank"
                rel="noopener noreferrer"
                download={safeDownloadName(envelope.title, '-sealed')}
              >
                <Icon icon={Download} size={14} />
                Sealed PDF
              </ButtonRoot>
            ) : null}
            {sealed && multiDoc
              ? docs.map((doc) =>
                  doc.sealed_url ? (
                    <ButtonRoot
                      key={doc.id}
                      as="a"
                      $variant="ghost"
                      $size="sm"
                      $fullWidth={false}
                      $iconOnly={false}
                      href={doc.sealed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={safeDownloadName(doc.title, '-sealed')}
                      aria-label={`Download sealed ${doc.title}`}
                    >
                      <Icon icon={Download} size={14} />
                      {`Sealed PDF ${doc.ord}`}
                    </ButtonRoot>
                  ) : null,
                )
              : null}
            {data.audit_url ? (
              <ButtonRoot
                as="a"
                $variant="ghost"
                $size="sm"
                $fullWidth={false}
                $iconOnly={false}
                href={data.audit_url}
                target="_blank"
                rel="noopener noreferrer"
                download={safeDownloadName(envelope.title, '-audit')}
              >
                <Icon icon={Download} size={14} />
                Audit trail PDF
              </ButtonRoot>
            ) : null}
          </DetailsFoot>
        </div>
      ) : null}
    </DetailsCard>
  );
}
