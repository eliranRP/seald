import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import type { BadgeTone } from '../../components/Badge/Badge.types';
import { Button } from '../../components/Button';
import { DocThumb } from '../../components/DocThumb';
import { Skeleton } from '../../components/Skeleton';
import { useEnvelopeQuery } from '../../features/envelopes';
import type { EnvelopeStatus, SignerUiStatus } from '../../features/envelopes';
import {
  Actions,
  Card,
  Code,
  HeadRow,
  HeadText,
  Inner,
  MetaGrid,
  MetaKey,
  MetaValue,
  Section,
  SectionHead,
  SignerEmail,
  SignerItem,
  SignerList,
  SignerName,
  SignerNames,
  Title,
  Wrap,
} from './EnvelopeDetailPage.styles';

const STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  awaiting_others: 'Awaiting others',
  sealing: 'Sealing',
  completed: 'Completed',
  declined: 'Declined',
  expired: 'Expired',
  canceled: 'Canceled',
};

const STATUS_TONE: Record<EnvelopeStatus, BadgeTone> = {
  draft: 'neutral',
  awaiting_others: 'amber',
  sealing: 'indigo',
  completed: 'emerald',
  declined: 'red',
  expired: 'red',
  canceled: 'neutral',
};

const SIGNER_STATUS_LABEL: Record<SignerUiStatus, string> = {
  awaiting: 'Awaiting',
  viewing: 'Viewing',
  completed: 'Signed',
  declined: 'Declined',
};

const SIGNER_STATUS_TONE: Record<SignerUiStatus, BadgeTone> = {
  awaiting: 'neutral',
  viewing: 'indigo',
  completed: 'emerald',
  declined: 'red',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * L4 page — read-only detail view for a server envelope. Shown when the user
 * clicks a row on the dashboard that corresponds to an envelope that was
 * created + sent via the `/envelopes` API (so there is no local `File` to
 * reopen in the authoring editor).
 *
 * Fetches from `/envelopes/:id` via React-Query; renders skeletons while
 * loading and a compact error card on 404 / other failures.
 */
export function EnvelopeDetailPage() {
  const { id } = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const q = useEnvelopeQuery(id ?? '', Boolean(id));

  if (q.isPending) {
    return (
      <Wrap>
        <Inner>
          <Card aria-busy="true">
            <HeadRow>
              <Skeleton variant="rect" width={40} height={40} />
              <HeadText>
                <Skeleton width={260} height={24} />
                <div style={{ marginTop: 8 }}>
                  <Skeleton width={140} />
                </div>
              </HeadText>
            </HeadRow>
            <Section>
              <SectionHead>Signers</SectionHead>
              <SignerList>
                {Array.from({ length: 2 }, (_, i) => (
                  <SignerItem key={i}>
                    <Skeleton variant="circle" width={32} height={32} />
                    <SignerNames>
                      <Skeleton width={140} />
                      <div style={{ marginTop: 6 }}>
                        <Skeleton width={180} />
                      </div>
                    </SignerNames>
                  </SignerItem>
                ))}
              </SignerList>
            </Section>
          </Card>
        </Inner>
      </Wrap>
    );
  }

  if (q.error || !q.data) {
    return (
      <Wrap>
        <Inner>
          <Card>
            <Title>Document not found</Title>
            <div style={{ marginTop: 12, color: 'var(--fg-3)', fontSize: 14 }}>
              We couldn&apos;t load this document. It may have been removed, or the link is stale.
            </div>
            <Actions>
              <Button variant="primary" iconLeft={ArrowLeft} onClick={() => navigate('/documents')}>
                Back to documents
              </Button>
            </Actions>
          </Card>
        </Inner>
      </Wrap>
    );
  }

  const env = q.data;
  return (
    <Wrap>
      <Inner>
        <Card>
          <HeadRow>
            <DocThumb size={40} title={env.title} signed={env.status === 'completed'} />
            <HeadText>
              <Title>{env.title}</Title>
              <Code>{env.short_code}</Code>
            </HeadText>
            <Badge tone={STATUS_TONE[env.status]}>{STATUS_LABEL[env.status]}</Badge>
          </HeadRow>

          <Section>
            <SectionHead>Details</SectionHead>
            <MetaGrid>
              <MetaKey>Pages</MetaKey>
              <MetaValue>{env.original_pages ?? '—'}</MetaValue>
              <MetaKey>Sent</MetaKey>
              <MetaValue>{formatWhen(env.sent_at)}</MetaValue>
              <MetaKey>Completed</MetaKey>
              <MetaValue>{formatWhen(env.completed_at)}</MetaValue>
              <MetaKey>Expires</MetaKey>
              <MetaValue>{formatWhen(env.expires_at)}</MetaValue>
            </MetaGrid>
          </Section>

          <Section>
            <SectionHead>Signers ({env.signers.length})</SectionHead>
            {env.signers.length === 0 ? (
              <div style={{ color: 'var(--fg-3)', fontSize: 14 }}>No signers on this envelope.</div>
            ) : (
              <SignerList>
                {env.signers.map((s) => (
                  <SignerItem key={s.id}>
                    <Avatar name={s.name} size={32} />
                    <SignerNames>
                      <SignerName>{s.name}</SignerName>
                      <SignerEmail>{s.email}</SignerEmail>
                    </SignerNames>
                    <Badge tone={SIGNER_STATUS_TONE[s.status]}>
                      {SIGNER_STATUS_LABEL[s.status]}
                    </Badge>
                  </SignerItem>
                ))}
              </SignerList>
            )}
          </Section>

          <Actions>
            <Button variant="secondary" iconLeft={ArrowLeft} onClick={() => navigate('/documents')}>
              Back to documents
            </Button>
          </Actions>
        </Card>
      </Inner>
    </Wrap>
  );
}
