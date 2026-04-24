import { CheckCircle2, LayoutList } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { DocThumb } from '../../components/DocThumb';
import { Skeleton } from '../../components/Skeleton';
import { useEnvelopeQuery } from '../../features/envelopes';
import { useAppState } from '../../providers/AppStateProvider';
import {
  Actions,
  Body,
  Card,
  DocCode,
  DocInfo,
  DocMeta,
  DocTitle,
  SealIcon,
  SignerEmail,
  SignerItem,
  SignerList,
  SignerMeta,
  SignerName,
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
 * L4 page — post-send confirmation. Shown right after the user completes the
 * Send step from the document editor, and also as a deep-link target when
 * the user lands on `/document/:id/sent` from the dashboard or from an
 * external bookmark. Prefers the in-memory draft (always fresh) and falls
 * back to `/envelopes/:id` when no draft is present locally.
 */
export function SentConfirmationPage() {
  const params = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const { getDocument } = useAppState();
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
            <Skeleton variant="circle" width={56} height={56} />
            <div style={{ marginTop: 16 }}>
              <Skeleton width={220} height={28} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Skeleton width={320} />
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
            <Button variant="primary" onClick={() => navigate('/documents')}>
              Back to documents
            </Button>
          </Actions>
        </Card>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Card>
        <SealIcon>
          <CheckCircle2 size={28} />
        </SealIcon>
        <Title>Request sent</Title>
        <Body>
          We&apos;ve emailed each signer a link to sign. You&apos;ll get a notification when
          everyone has completed the document.
        </Body>

        <DocMeta>
          <DocThumb size={40} title={summary.title} />
          <DocInfo>
            <DocTitle>{summary.title}</DocTitle>
            <DocCode>{summary.code}</DocCode>
          </DocInfo>
        </DocMeta>

        <div>
          <SignerList aria-label="Signers">
            {summary.signers.map((s) => (
              <SignerItem key={s.id}>
                <Avatar name={s.name} size={32} />
                <SignerMeta>
                  <SignerName>{s.name}</SignerName>
                  <SignerEmail>{s.email}</SignerEmail>
                </SignerMeta>
              </SignerItem>
            ))}
          </SignerList>
        </div>

        <Actions>
          <Button variant="primary" iconLeft={LayoutList} onClick={() => navigate('/documents')}>
            Back to documents
          </Button>
        </Actions>
      </Card>
    </Wrap>
  );
}
