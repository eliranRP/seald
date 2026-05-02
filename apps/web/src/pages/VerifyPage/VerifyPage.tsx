import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check,
  Clock,
  FileText,
  Globe,
  ShieldCheck,
  ShieldAlert,
  Users,
  Download,
  Share2,
} from 'lucide-react';
import { Icon } from '@/components/Icon';
import { useVerifyEnvelope } from '@/features/verify';
import type { VerifyEnvelope, VerifyEvent, VerifyResponse, VerifySigner } from '@/features/verify';
import {
  Avatar,
  Btn,
  Card,
  CardHead,
  Container,
  DocActions,
  DocMeta,
  DocSub,
  DocTitle,
  ErrorPanel,
  Fact,
  FactKey,
  FactVal,
  Facts,
  Footer,
  FooterLeft,
  FooterRight,
  Integrity,
  IntegrityIco,
  IntegrityInner,
  IntegrityMeta,
  IntegrityText,
  Page,
  SignerCheck,
  SignerEmail,
  SignerName,
  SignerRow,
  SignersList,
  SkeletonBlock,
  Tag,
  Timeline,
  TimelineActor,
  TimelineBody,
  TimelineDot,
  TimelineDotCol,
  TimelineHead,
  TimelineLine,
  TimelineList,
  TimelineRow,
  TimelineTime,
  Verdict,
  VerdictBody,
  VerdictEyebrow,
  VerdictHeading,
  VerdictMark,
} from './VerifyPage.styles';

const AVATAR_PALETTE = [
  '#4F46E5',
  '#0F766E',
  '#B45309',
  '#BE185D',
  '#1D4ED8',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
] as const;

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    // eslint-disable-next-line no-bitwise -- 32-bit string hash; Math operations would lose the int wrap
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
  }
  // Safety: AVATAR_PALETTE has length > 0; the modulo always lands inside.
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx] ?? AVATAR_PALETTE[0]!;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function shortHash(hash: string | null): string {
  if (!hash) return '';
  if (hash.length <= 32) return hash;
  return `${hash.slice(0, 32)}\n${hash.slice(32)}`;
}

// Card subtitle: "Sealed Apr 25, 2026" — date only, per design
// (Design-Guide/project/verify-flow.html line 590).
function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Sealed-at fact row: "Apr 25, 2026 · 21:21 UTC" — short date + HH:MM,
// per design (Design-Guide/project/verify-flow.html line 645).
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = formatShortDate(iso);
  const time = d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${date} · ${time} UTC`;
}

function formatTimelineTime(iso: string): { readonly date: string; readonly time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const time = d
    .toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    })
    .replace(/\s.*$/, '');
  return { date, time };
}

// Exhaustive map: VerifyEvent['event_type'] is a closed union, so
// TypeScript will fail compilation if a new value is added to the
// canonical EVENT_TYPES enum without a label here. That guard is
// the *only* defense against another blank-page bug — describeEvent
// calls .toLowerCase() on the looked-up value, which crashes if the
// key is missing. Keep this map in lockstep with VerifyEventType.
const EVENT_LABEL: Record<VerifyEvent['event_type'], string> = {
  created: 'Document created',
  sent: 'Envelope sent',
  viewed: 'Document viewed',
  tc_accepted: 'Terms accepted',
  esign_disclosure_acknowledged: 'E-sign disclosure acknowledged',
  intent_to_sign_confirmed: 'Intent to sign confirmed',
  consent_withdrawn: 'E-sign consent withdrawn',
  field_filled: 'Field filled',
  signed: 'Signature captured',
  all_signed: 'All signers complete',
  sealed: 'Document sealed',
  declined: 'Signing declined',
  expired: 'Envelope expired',
  canceled: 'Envelope canceled',
  reminder_sent: 'Reminder sent',
  session_invalidated_by_decline: 'Session invalidated',
  session_invalidated_by_cancel: 'Session invalidated (cancel)',
  job_failed: 'Sealing job failed',
  retention_deleted: 'Document retention expired',
};

interface DerivedView {
  readonly variant: 'success' | 'failed' | 'neutral';
  readonly heading: React.ReactNode;
  readonly eyebrow: string;
  readonly body: string;
  readonly mark: React.ReactNode;
}

function deriveView(envelope: VerifyEnvelope): DerivedView {
  if (envelope.status === 'completed') {
    return {
      variant: 'success',
      eyebrow: 'Verified · seal intact',
      heading: (
        <>
          This document is <em>sealed</em>.
        </>
      ),
      body: 'We checked the fingerprint on file against our trust ledger. Everything matches — this PDF has not been altered since it was signed.',
      mark: (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="5 13 10 18 19 8" />
        </svg>
      ),
    };
  }
  if (envelope.status === 'declined') {
    return {
      variant: 'failed',
      eyebrow: 'Declined · not sealed',
      heading: (
        <>
          A signer <em className="danger">declined</em>.
        </>
      ),
      body: 'This envelope was withdrawn before all signatures were captured. The audit trail below is preserved as evidence of the decline.',
      mark: (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      ),
    };
  }
  if (envelope.status === 'expired') {
    return {
      variant: 'neutral',
      eyebrow: 'Expired · not sealed',
      heading: (
        <>
          This envelope <em className="danger">expired</em>.
        </>
      ),
      body: 'The signing window closed before all parties completed their signatures. The audit trail below is preserved.',
      mark: (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    };
  }
  if (envelope.status === 'canceled') {
    return {
      variant: 'neutral',
      eyebrow: 'Canceled · not sealed',
      heading: (
        <>
          This envelope was <em className="danger">canceled</em>.
        </>
      ),
      body: 'The sender withdrew this envelope before completion. The audit trail below records what happened.',
      mark: (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    };
  }
  return {
    variant: 'neutral',
    eyebrow: 'In progress',
    heading: (
      <>
        Awaiting <em>signatures</em>.
      </>
    ),
    body: 'Signers are still working through this envelope. Check back once everyone has signed.',
    mark: (
      <svg
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  };
}

// Browser `download` attribute: the visible button copy says "Download",
// so users expect the file to *save*. Without an explicit download
// filename the browser opens the PDF in a tab and (if the user does
// save) names the file after the S3 presigned-URL path — opaque hashes
// + query strings, useless for a downloads folder. Slugify the envelope
// title so the saved filename is human-readable.
function safeDownloadName(title: string, suffix: string): string {
  const slug = title
    .normalize('NFKD')
    // Strip combining accents.
    .replace(/[\u0300-\u036f]/g, '')
    // Anything that isn't a safe filesystem char becomes `-`.
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const base = slug.length > 0 ? slug : 'document';
  return `${base}${suffix}.pdf`;
}

function describeEvent(ev: VerifyEvent, signers: ReadonlyArray<VerifySigner>): string {
  if (ev.signer_id) {
    const s = signers.find((x) => x.id === ev.signer_id);
    if (s) return `${s.name} — ${EVENT_LABEL[ev.event_type].toLowerCase()}.`;
  }
  return `${ev.actor_kind} — ${EVENT_LABEL[ev.event_type].toLowerCase()}.`;
}

function actorLabel(ev: VerifyEvent, signers: ReadonlyArray<VerifySigner>): string {
  if (ev.signer_id) {
    const s = signers.find((x) => x.id === ev.signer_id);
    if (s) return s.name;
  }
  if (ev.actor_kind === 'sender') return 'Sender';
  if (ev.actor_kind === 'system') return 'Sealed system';
  return 'Signer';
}

function toneFor(eventType: VerifyEvent['event_type']): 'warn' | 'success' | 'indigo' {
  if (
    eventType === 'declined' ||
    eventType === 'expired' ||
    eventType === 'canceled' ||
    eventType === 'job_failed' ||
    eventType === 'retention_deleted' ||
    eventType === 'session_invalidated_by_decline'
  ) {
    return 'warn';
  }
  if (eventType === 'sealed' || eventType === 'signed' || eventType === 'all_signed') {
    return 'success';
  }
  return 'indigo';
}

function SignerStatusIcon({ status }: { readonly status: VerifySigner['status'] }) {
  if (status === 'declined') {
    return (
      <svg
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    );
  }
  if (status === 'completed') {
    return (
      <svg
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return null;
}

interface IntegrityCopyProps {
  readonly variant: 'success' | 'failed' | 'neutral';
  readonly sealed: boolean;
  readonly signersDone: number;
  readonly signersAll: number;
}

function IntegrityCopy({ variant, sealed, signersDone, signersAll }: IntegrityCopyProps) {
  if (variant === 'failed') {
    return (
      <>
        <strong>This envelope was not sealed.</strong> The audit trail records why.
      </>
    );
  }
  if (sealed) {
    return (
      <>
        <strong>The document, signers, and timestamp are unchanged since the seal.</strong>
        <br />
        If a single byte of the file had changed, this seal would be broken.
      </>
    );
  }
  return (
    <>
      <strong>
        {signersDone} of {signersAll} signatures recorded.
      </strong>{' '}
      The seal is created automatically once everyone has signed.
    </>
  );
}

interface SignersFactProps {
  readonly signers: ReadonlyArray<VerifySigner>;
}

function SignersFact({ signers }: SignersFactProps) {
  const signed = signers.filter((s) => s.status === 'completed').length;
  const declined = signers.some((s) => s.status === 'declined');
  return (
    <Fact>
      <FactKey>
        <Users aria-hidden />
        Signers
      </FactKey>
      <FactVal>
        <SignersList>
          {signers.map((s) => (
            <SignerRow key={s.id}>
              <Avatar $bg={colorFor(s.id)} aria-hidden>
                {initialsFor(s.name)}
              </Avatar>
              <SignerName>{s.name}</SignerName>
              <SignerEmail>{s.email}</SignerEmail>
              <SignerCheck $declined={s.status === 'declined'} aria-hidden>
                <SignerStatusIcon status={s.status} />
              </SignerCheck>
            </SignerRow>
          ))}
        </SignersList>
      </FactVal>
      <Tag $tone={declined ? 'danger' : 'success'}>
        {signed} of {signers.length} signed
      </Tag>
    </Fact>
  );
}

interface VerifyContentProps {
  readonly data: VerifyResponse;
}

function VerifyContent({ data }: VerifyContentProps) {
  const view = useMemo(() => deriveView(data.envelope), [data.envelope]);
  const sealed = data.envelope.status === 'completed';
  const signersAll = data.signers.length;
  const signersDone = data.signers.filter((s) => s.status === 'completed').length;
  // REQ id format per Design-Guide/project/verify-flow.html line 586:
  // "REQ 804A6C00-2AD9-4590" — first two UUID groups, uppercased. Full
  // UUID is overkill for a header-line ID and pushes the metadata onto
  // a second line on narrow viewports.
  const reqId = `REQ ${data.envelope.id.split('-').slice(0, 2).join('-').toUpperCase()}`;

  return (
    <Page $variant={view.variant}>
      <Container>
        <Verdict>
          <VerdictMark $variant={view.variant} aria-hidden>
            {view.mark}
          </VerdictMark>
          <VerdictEyebrow $variant={view.variant}>{view.eyebrow}</VerdictEyebrow>
          <VerdictHeading>{view.heading}</VerdictHeading>
          <VerdictBody>{view.body}</VerdictBody>
        </Verdict>

        <Card>
          <CardHead>
            <DocMeta>
              <div aria-hidden style={{ width: 36, height: 46, flexShrink: 0 }}>
                <Icon icon={FileText} size={28} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <DocTitle>{data.envelope.title}</DocTitle>
                <DocSub>
                  <span className="id">{reqId}</span>
                  <span className="sep" aria-hidden />
                  <span>
                    {data.envelope.original_pages ?? '—'}{' '}
                    {data.envelope.original_pages === 1 ? 'page' : 'pages'}
                  </span>
                  {data.envelope.completed_at ? (
                    <>
                      <span className="sep" aria-hidden />
                      <span>Sealed {formatShortDate(data.envelope.completed_at)}</span>
                    </>
                  ) : null}
                </DocSub>
              </div>
            </DocMeta>
            <DocActions>
              {data.sealed_url ? (
                <Btn
                  href={data.sealed_url}
                  $variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  download={safeDownloadName(data.envelope.title, '-sealed')}
                >
                  <Download aria-hidden />
                  Download
                </Btn>
              ) : null}
              {data.audit_url ? (
                <Btn
                  href={data.audit_url}
                  $variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  download={safeDownloadName(data.envelope.title, '-audit')}
                >
                  <Share2 aria-hidden />
                  Audit PDF
                </Btn>
              ) : null}
            </DocActions>
          </CardHead>

          <Facts>
            <Fact>
              <FactKey>
                <FileText aria-hidden />
                Document
              </FactKey>
              <FactVal>{data.envelope.title}</FactVal>
              <Tag $tone="indigo">PDF · v1</Tag>
            </Fact>

            <SignersFact signers={data.signers} />

            <Fact>
              <FactKey>
                <Clock aria-hidden />
                {sealed ? 'Sealed at' : 'Last activity'}
              </FactKey>
              <FactVal>
                {formatDateTime(data.envelope.completed_at ?? data.envelope.sent_at)}
              </FactVal>
              <Tag $tone={sealed ? 'success' : 'neutral'}>
                {sealed ? 'PAdES-LT' : data.envelope.status}
              </Tag>
            </Fact>

            {data.envelope.original_sha256 ? (
              <Fact>
                <FactKey>
                  <ShieldCheck aria-hidden />
                  Original hash
                </FactKey>
                <FactVal $hash aria-label="Original SHA-256 hash">
                  {shortHash(data.envelope.original_sha256)}
                </FactVal>
                <Tag $tone="success">SHA-256 · original</Tag>
              </Fact>
            ) : null}

            {data.envelope.sealed_sha256 ? (
              <Fact>
                <FactKey>
                  <ShieldCheck aria-hidden />
                  Sealed hash
                </FactKey>
                <FactVal $hash aria-label="Sealed SHA-256 hash">
                  {shortHash(data.envelope.sealed_sha256)}
                </FactVal>
                <Tag $tone="success">SHA-256 · match</Tag>
              </Fact>
            ) : null}

            <Fact>
              <FactKey>
                <Globe aria-hidden />
                Verification URL
              </FactKey>
              <FactVal $mono>seald.nromomentum.com/verify/{data.envelope.short_code}</FactVal>
              <Tag $tone="neutral">Public</Tag>
            </Fact>
          </Facts>

          <Integrity $failed={view.variant === 'failed'}>
            <IntegrityInner>
              <IntegrityIco $failed={view.variant === 'failed'}>
                {view.variant === 'failed' ? (
                  <ShieldAlert aria-hidden />
                ) : (
                  <ShieldCheck aria-hidden />
                )}
              </IntegrityIco>
              <IntegrityText>
                <IntegrityCopy
                  variant={view.variant}
                  sealed={sealed}
                  signersDone={signersDone}
                  signersAll={signersAll}
                />
              </IntegrityText>
            </IntegrityInner>
            <IntegrityMeta>
              <Tag
                $tone={data.chain_intact ? 'success' : 'danger'}
                aria-label="Audit chain status"
                title={
                  data.chain_intact
                    ? 'Every audit row hashes to its predecessor (verifyEventChain).'
                    : 'A row in the audit log fails its prev_event_hash check — possible tampering.'
                }
              >
                {data.chain_intact ? 'Audit chain · intact' : 'Audit chain · broken'}
              </Tag>
              <span>Seald, Inc. · trust cert RSA-4096</span>
            </IntegrityMeta>
          </Integrity>

          <Timeline>
            <TimelineHead>
              Activity · {data.events.length} {data.events.length === 1 ? 'event' : 'events'}
            </TimelineHead>
            <TimelineList>
              {data.events.map((ev) => {
                const t = formatTimelineTime(ev.created_at);
                const tone = toneFor(ev.event_type);
                return (
                  <TimelineRow key={ev.id}>
                    <TimelineTime>
                      <span className="d">{t.date}</span>
                      {t.time}
                    </TimelineTime>
                    <TimelineDotCol aria-hidden>
                      <TimelineDot $tone={tone} />
                      <TimelineLine />
                    </TimelineDotCol>
                    <TimelineBody>
                      <strong>{EVENT_LABEL[ev.event_type]}</strong>
                      <span>{describeEvent(ev, data.signers)}</span>
                    </TimelineBody>
                    <TimelineActor>
                      <span className="nm">{actorLabel(ev, data.signers)}</span>
                    </TimelineActor>
                  </TimelineRow>
                );
              })}
            </TimelineList>
          </Timeline>
        </Card>

        <Footer>
          <FooterLeft>
            <span>Verification by Seald, Inc.</span>
          </FooterLeft>
          <FooterRight>
            <span>
              <Check aria-hidden /> AES-256 at rest
            </span>
            <span>
              <Check aria-hidden /> RFC 3161 timestamps
            </span>
            <span>
              <Check aria-hidden /> PAdES-LT seal
            </span>
          </FooterRight>
        </Footer>
      </Container>
    </Page>
  );
}

function VerifyLoading() {
  return (
    <Page $variant="neutral">
      <Container aria-busy aria-live="polite" aria-label="Loading verification">
        <Verdict>
          <SkeletonBlock
            style={{ width: 88, height: 88, borderRadius: '50%', margin: '0 auto 20px' }}
          />
          <SkeletonBlock style={{ width: 320, height: 36, margin: '0 auto 12px' }} />
          <SkeletonBlock style={{ width: 480, height: 18, margin: '0 auto' }} />
        </Verdict>
        <Card>
          <CardHead>
            <SkeletonBlock style={{ width: '60%', height: 28 }} />
          </CardHead>
          <Facts>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} style={{ width: '100%', height: 38, margin: '12px 0' }} />
            ))}
          </Facts>
        </Card>
      </Container>
    </Page>
  );
}

interface VerifyErrorProps {
  readonly status?: number;
  readonly message?: string;
}

function VerifyError({ status, message }: VerifyErrorProps) {
  const isNotFound = status === 404;
  return (
    <Page $variant="neutral">
      <Container>
        <ErrorPanel role="alert">
          <h2>{isNotFound ? "We couldn't find this envelope" : 'Something went wrong'}</h2>
          <p>
            {isNotFound
              ? "The verification code you used doesn't match any envelope. Double-check the link or QR code on the audit PDF."
              : (message ?? 'Try again in a moment. If this keeps happening, contact the sender.')}
          </p>
        </ErrorPanel>
      </Container>
    </Page>
  );
}

/**
 * `/verify/:shortCode` — public verification surface (rule 1.5: thin page).
 *
 * Anyone with a 13-char short_code can render this page. No auth, no
 * Supabase session. Business logic lives in `useVerifyEnvelope`; this
 * component composes the verdict hero, the document card, the audit
 * timeline, and the trust footer per `Design-Guide/project/verify-flow.html`.
 */
export function VerifyPage() {
  const params = useParams<{ readonly shortCode: string }>();
  const shortCode = params.shortCode ?? '';
  const query = useVerifyEnvelope(shortCode);

  if (query.isPending) return <VerifyLoading />;
  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status;
    const message = query.error?.message;
    if (status !== undefined && message) {
      return <VerifyError status={status} message={message} />;
    }
    if (status !== undefined) return <VerifyError status={status} />;
    if (message) return <VerifyError message={message} />;
    return <VerifyError />;
  }
  return <VerifyContent data={query.data} />;
}
