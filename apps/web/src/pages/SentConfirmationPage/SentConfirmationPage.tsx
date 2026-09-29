import { Check, LayoutList, ShieldCheck } from 'lucide-react';
import { RetentionNotice } from '@/components/shared/RetentionNotice';
import { SenderProgressNote } from '@/components/shared/SenderProgressNote';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { DocThumb } from '@/components/DocThumb';
import { Skeleton } from '@/components/Skeleton';
import { useEnvelopeQuery } from '@/features/envelopes';
import { useAppState } from '@/providers/AppStateProvider';
import { useAuth } from '@/providers/AuthProvider';
import {
  Actions,
  AuditBadge,
  Body,
  Card,
  DeliveredChip,
  DocCode,
  DocInfo,
  DocMeta,
  DocTitle,
  Kicker,
  RetentionNote,
  SealBadge,
  SignerEmail,
  SignerItem,
  SignerList,
  SignerMeta,
  SignerName,
  SignersCaption,
  Title,
  Wrap,
} from './SentConfirmationPage.styles';

/** Lightweight projection common to both the local-draft source and the API. */
interface SentSummary {
  readonly title: string;
  readonly code: string;
  readonly signers: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string;
  }>;
}

/**
 * L4 page — the "sealed" confirmation page shown right after the user
 * completes the Send step (or as a deep-link from the dashboard).
 *
 * Layout follows the kit's sealed page: centered card with an animated
 * wax-seal success badge, serif headline "Your envelope is on
 * its way.", envelope preview card, delivered-signer chips, an audit-
 * trail trust badge, and a pair of follow-up actions.
 */
export function SentConfirmationPage() {
  const params = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const { getDocument } = useAppState();
  const { guest } = useAuth();
  // `/documents` is gated by `RequireAuth` (not `RequireAuthOrGuest`), so a
  // guest sender clicking "Back to documents" would get bounced back to
  // `/document/new`. Steer them straight there to avoid the round-trip
  // flash. Authed users continue to land on the dashboard list.
  const documentsHref = guest ? '/document/new' : '/documents';
  const draft = params.id ? getDocument(params.id) : undefined;

  // Only fetch from the server when the local draft is missing — saves a
  // round-trip for the common "just sent" path.
  const serverQuery = useEnvelopeQuery(params.id ?? '', Boolean(params.id && !draft));

  let summary: SentSummary | null = null;
  if (draft) {
    summary = {
      title: draft.title,
      code: draft.code,
      signers: draft.signers.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    };
  } else if (serverQuery.data) {
    summary = {
      title: serverQuery.data.title,
      code: serverQuery.data.short_code,
      signers: serverQuery.data.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
      })),
    };
  }

  if (!summary) {
    if (serverQuery.isPending) {
      return (
        <Wrap>
          <Card aria-busy="true">
            <Skeleton variant="circle" width={88} height={88} />
            <div style={{ marginTop: 16 }}>
              <Skeleton width={280} height={40} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Skeleton width={360} />
            </div>
          </Card>
        </Wrap>
      );
    }
    return (
      <Wrap>
        <Card>
          <Title>Document not found</Title>
          <Body>We couldn&apos;t find this document. It may have been removed.</Body>
          <Actions>
            <Button variant="primary" onClick={() => navigate(documentsHref)}>
              Back to documents
            </Button>
          </Actions>
        </Card>
      </Wrap>
    );
  }

  const openEnvelope = (): void => {
    if (params.id) navigate(`/document/${params.id}`);
    else navigate(documentsHref);
  };

  return (
    <Wrap>
      <Card>
        <SealBadge aria-hidden>
          {/* Same inline checkmark the VerifyPage's success VerdictMark
              uses — kept inline so the stroke matches the rounded
              line-cap treatment that lucide's <Check> stroke renders
              square at this size. */}
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
        </SealBadge>
        <Kicker>Sent</Kicker>
        <Title>Your envelope is on its way.</Title>
        <Body>
          <SenderProgressNote />
        </Body>

        <DocMeta>
          <DocThumb size={40} title={summary.title} />
          <DocInfo>
            <DocTitle>{summary.title}</DocTitle>
            <DocCode>{summary.code}</DocCode>
          </DocInfo>
        </DocMeta>

        <SignersCaption>
          {summary.signers.length === 1
            ? 'Invitation queued for'
            : `Invitations queued for ${summary.signers.length} signers`}
        </SignersCaption>
        <SignerList aria-label="Signers">
          {summary.signers.map((s) => (
            <SignerItem key={s.id}>
              <Avatar name={s.name} size={32} />
              <SignerMeta>
                <SignerName>{s.name}</SignerName>
                <SignerEmail>{s.email}</SignerEmail>
              </SignerMeta>
              <DeliveredChip>
                <Check size={11} strokeWidth={3} /> Queued
              </DeliveredChip>
            </SignerItem>
          ))}
        </SignerList>

        <AuditBadge>
          <ShieldCheck size={14} />
          Events are hash-chained as they happen. The audit PDF is created when everyone has signed.
        </AuditBadge>

        <RetentionNote>
          <RetentionNotice verifyPath={`/verify/${summary.code}`} />
        </RetentionNote>

        <Actions>
          <Button variant="primary" iconLeft={ShieldCheck} onClick={openEnvelope}>
            View envelope
          </Button>
          <Button variant="secondary" iconLeft={LayoutList} onClick={() => navigate(documentsHref)}>
            Back to documents
          </Button>
        </Actions>
      </Card>
    </Wrap>
  );
}
