import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { XCircle } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readDoneSnapshot } from '@/features/signing';

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
`;

const Inner = styled.div`
  max-width: 560px;
  margin: 0 auto;
  padding: 56px 24px 80px;
  text-align: center;
`;

const IconBadge = styled.div`
  width: 88px;
  height: 88px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[150]};
  color: ${({ theme }) => theme.color.fg[2]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
`;

const Hero = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 36px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

const Body = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[4]} 0 0;
  line-height: 1.6;
`;

const ExitBtn = styled.button`
  margin-top: ${({ theme }) => theme.space[8]};
  padding: 12px 24px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
`;

/**
 * `/sign/:envelopeId/declined` — terminal state after the recipient declines.
 * Reads the sessionStorage snapshot; missing → route to entry.
 */
export function SigningDeclinedPage() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const snap = useMemo(() => readDoneSnapshot(envelopeId), [envelopeId]);

  if (!snap || snap.kind !== 'declined') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  return (
    <Page>
      <Inner>
        <IconBadge>
          <Icon icon={XCircle} size={42} />
        </IconBadge>
        <Hero>You declined this request.</Hero>
        <Body>
          {snap.sender_name
            ? `We've let ${snap.sender_name} know. No further action needed.`
            : "We've let the sender know. No further action needed."}
        </Body>
        <ExitBtn type="button" onClick={() => navigate('/')}>
          Take me out
        </ExitBtn>
      </Inner>
    </Page>
  );
}
