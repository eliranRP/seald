import { CheckCircle2, Eye, LayoutList } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { DocThumb } from '../../components/DocThumb';
import { useAppState } from '../../providers/AppStateProvider';

const Wrap = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: ${({ theme }) => theme.space[12]};
`;

const Card = styled.div`
  max-width: 640px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: ${({ theme }) => theme.space[8]};
`;

const SealIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.success[50]};
  color: ${({ theme }) => theme.color.success[500]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Body = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const DocMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  align-items: center;
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

const DocInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
`;

const DocTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 14px;
`;

const DocCode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

const SignerList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

const SignerRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[2]};
`;

const SignerMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const SignerName = styled.span`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const SignerEmail = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
`;

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
              <SignerRow key={s.id}>
                <Avatar name={s.name} size={32} />
                <SignerMeta>
                  <SignerName>{s.name}</SignerName>
                  <SignerEmail>{s.email}</SignerEmail>
                </SignerMeta>
              </SignerRow>
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
