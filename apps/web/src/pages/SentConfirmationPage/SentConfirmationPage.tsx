import { CheckCircle2, Eye, LayoutList } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { DocThumb } from '../../components/DocThumb';
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

/**
 * L4 page — post-send confirmation. Shown right after the user completes the
 * Send step from the document editor. Lists every signer the envelope was
 * routed to so the user has a clear "what did I just ship" moment before
 * returning to the dashboard.
 */
export function SentConfirmationPage() {
  const params = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const { getDocument } = useAppState();
  const doc = params.id ? getDocument(params.id) : undefined;

  if (!doc) {
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
          <DocThumb size={40} title={doc.title} />
          <DocInfo>
            <DocTitle>{doc.title}</DocTitle>
            <DocCode>{doc.code}</DocCode>
          </DocInfo>
        </DocMeta>

        <div>
          <SignerList aria-label="Signers">
            {doc.signers.map((s) => (
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
          <Button variant="secondary" iconLeft={Eye} onClick={() => navigate('/email/request')}>
            Preview email
          </Button>
          <Button variant="primary" iconLeft={LayoutList} onClick={() => navigate('/documents')}>
            Back to documents
          </Button>
        </Actions>
      </Card>
    </Wrap>
  );
}
